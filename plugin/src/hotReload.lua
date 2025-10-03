-- thank you einsteinK
-- https://devforum.roblox.com/t/61917/8

local hotReload = {}

local function assertf(c, m, ...)
	if c then
		return
	end
	error(m:format(...), 0)
end

local loading, ERR = {}, {}
local globalTable = {}

function hotReload.flush()
	table.clear(loading)
	table.clear(globalTable)
end

function hotReload.require(mod)
	local cached = loading[mod]
	while cached == false do
		wait()
		cached = loading[mod]
	end
	assertf(cached ~= ERR, "Error while loading module")
	if cached then
		return cached
	end
	local s, e = loadstring(mod.Source, mod:GetFullName())
	assertf(s, "Parsing error for %s: %s", mod:GetFullName(), tostring(e))
	loading[mod] = false
	local env = setmetatable({
		script = mod,
		require = hotReload.require,
		_G = globalTable,
	}, {
		__index = getfenv(),
	})
	s, e = pcall(setfenv(s, env))
	if not s then
		loading[mod] = ERR
	end
	assertf(s, "Running error for %s: %s", mod:GetFullName(), tostring(e))
	loading[mod] = e
	return e
end

return hotReload
