local RunService = game:GetService("RunService")

if RunService:IsRunning() then
	return
end

local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TestService = game:GetService("TestService")

local extractUsefulKeys = require(script.Parent.extractUsefulKeys)
local hotReload = require(script.Parent.hotReload)
local unwrapPath = require(script.Parent.unwrapPath)

local function log(printingFunction, message)
	printingFunction("[TestEZ Companion] " .. message)
end

local BASE_PORTS = { 28900, 28901, 28902 }
local ACTIVE_PORT = nil
local BASE_URL = nil

local PlaceGUID = HttpService:GenerateGUID(false)

-- 从 TestService 读取项目信息
local function loadProjectInfo()
	local infoNode = TestService:FindFirstChild("testez-companion-info")
	if not infoNode then
		return nil
	end

	-- 读取属性
	local name = infoNode:GetAttribute("name")
	local hash = infoNode:GetAttribute("hash")
	local date = infoNode:GetAttribute("date")

	if name and hash and date then
		local info = {
			name = name,
			hash = hash,
			date = date
		}
		return info
	else
		return nil
	end
end

-- Function to get current headers (使用 project-info 中的 name)
local function getIdentifierHeaders()
	local projectInfo = loadProjectInfo()
	-- 如果没有项目信息，不发送请求
	if not projectInfo then
		return nil
	end

	return {
		["place-id"] = tostring(game.PlaceId),
		["place-name"] = game.Name,
		["place-guid"] = PlaceGUID,
		["game-name"] = tostring(projectInfo.name), -- 使用 project-info 中的 name
		["project-hash"] = tostring(projectInfo.hash or "unknown"), -- 发送项目哈希
		["project-date"] = tostring(projectInfo.date or "unknown"), -- 确保时间是字符串
	}
end

local reporter = {
	report = function(results, caughtFromTestEZ)
		local Headers = {
			["Content-Type"] = "application/json",
			["place-guid"] = PlaceGUID,
		}
		if caughtFromTestEZ then
			Headers["caught-testez-error"] = "true"
		end

		local ok, serverResponse = pcall(HttpService.RequestAsync, HttpService, {
			Url = BASE_URL .. "/results",
			Method = "POST",
			Headers = Headers,
			Body = HttpService:JSONEncode(extractUsefulKeys(results)),
		})

		if not ok or serverResponse.StatusCode ~= 200 then
			log(warn, "Failed to report test results to the server (" .. serverResponse .. ")")
		end
	end,
}

local logServiceConnection

local POLLING_INTERVAL = 0.7

-- Function to find an available server
local function findAvailableServer()

	for i, port in ipairs(BASE_PORTS) do
		local testUrl = "http://127.0.0.1:" .. tostring(port)

		local headers = getIdentifierHeaders()
		if not headers then
			-- 没有项目信息，跳过此端口
			continue
		end

		local ok, result = pcall(HttpService.RequestAsync, HttpService, {
			Url = testUrl .. "/poll",
			Method = "GET",
			Headers = headers,
		})

		if ok then
			if result.StatusCode == 200 then
				-- Server is ready and accepting this game
				ACTIVE_PORT = port
				BASE_URL = testUrl
				return true
			elseif result.StatusCode == 403 then
				-- Server exists but is handling a different game or not ready
			end
		end

		-- Wait 0.3 seconds before trying next port (except for the last port)
		if i < #BASE_PORTS then
			task.wait(0.3)
		end
	end

	return false
end

-- Main polling loop
while true do
	-- 每次都尝试加载项目信息（不再缓存）
	local projectInfo = loadProjectInfo()
	if not projectInfo then
		-- 如果没有找到项目信息，等待并继续
		task.wait(2) -- 等待2秒后再试
		continue
	end

	-- If we don't have an active server, try to find one
	if not ACTIVE_PORT then
		if not findAvailableServer() then
			task.wait(POLLING_INTERVAL)
			continue
		end
	end

	local headers = getIdentifierHeaders()
	if not headers then
		-- 没有有效的 headers
		task.wait(POLLING_INTERVAL)
		continue
	end

	local ok, serverResponse = pcall(HttpService.RequestAsync, HttpService, {
		Url = BASE_URL .. "/poll",
		Method = "GET",
		Headers = headers,
	})

	if not ok then
		-- Server might be down, reset and try to find another
		ACTIVE_PORT = nil
		BASE_URL = nil
		task.wait(POLLING_INTERVAL)
		continue
	elseif serverResponse.StatusCode == 403 then
		-- Server doesn't want us anymore, reset and find another
		ACTIVE_PORT = nil
		BASE_URL = nil
		task.wait(POLLING_INTERVAL)
		continue
	end

	if ok and serverResponse.StatusCode == 200 then

		-- Wrap entire test execution in pcall to catch all errors
		local testExecutionOk, testExecutionError = pcall(function()
			local config = HttpService:JSONDecode(serverResponse.Body)
			local roots = {}
			local hasValidRoots = false
			local invalidPaths = {}

			for _, rootPath in ipairs(config.testRoots) do
				local unwrapOk, unwrapped = pcall(unwrapPath, rootPath)

				if unwrapOk and unwrapped then
					table.insert(roots, unwrapped)
					hasValidRoots = true
				else
					table.insert(invalidPaths, rootPath)
					log(
						warn,
						'Could not resolve test root "'
							.. rootPath
							.. '" (the instance could not be found in the DataModel).'
					)
				end
			end

			-- If no valid roots found, report error with clear message
			if not hasValidRoots then
				local pathList = table.concat(invalidPaths, ", ")
				error("测试路径错误: " .. pathList)
			end

			LogService:ClearOutput()
			logServiceConnection = LogService.MessageOut:Connect(function(message, messageType)
				pcall(HttpService.RequestAsync, HttpService, {
					Url = BASE_URL .. "/logs",
					Method = "POST",
					Body = HttpService:JSONEncode({
						message = message,
						messageType = messageType.Value,
					}),
					Headers = {
						["Content-Type"] = "application/json",
					},
				})
			end)
			hotReload.flush()
			local TestEZ = hotReload.require(script.Parent.TestEZ)
			local testsOk, runnerError =
				pcall(TestEZ.TestBootstrap.run, TestEZ.TestBootstrap, roots, reporter, config.testExtraOptions)

			if logServiceConnection then
				logServiceConnection:Disconnect()
				logServiceConnection = nil
			end

			if not testsOk then
				log(warn, "Caught an error from TestEZ:")
				print(runnerError)
				reporter.report({
					children = {},
					errors = { runnerError },
					failureCount = 1,
					skippedCount = 0,
					successCount = 0,
				}, true)
			end
		end)

		-- If entire test execution failed, report the error
		if not testExecutionOk then
			local errorMessage = tostring(testExecutionError)

			-- Check if this is an unwrapPath error and format it specially
			if string.find(errorMessage, "unwrapPath") and string.find(errorMessage, "attempt to index nil") then
				-- Extract the path from config that caused the error
				local config = HttpService:JSONDecode(serverResponse.Body)
				local pathList = table.concat(config.testRoots or {}, ", ")
				errorMessage = "测试路径错误: " .. pathList
			end

			log(warn, errorMessage)

			-- Clean up log connection if it exists
			if logServiceConnection then
				logServiceConnection:Disconnect()
				logServiceConnection = nil
			end

			-- Report error to CLI
			reporter.report({
				children = {},
				errors = { errorMessage },
				failureCount = 1,
				skippedCount = 0,
				successCount = 0,
			}, true)
		end
	end

	task.wait(POLLING_INTERVAL)
end
