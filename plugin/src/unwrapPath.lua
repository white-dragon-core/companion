local function unwrapPath(path)
	local segments = string.split(path, "/")
	local lastParent = game

	for _, segment in ipairs(segments) do
		if lastParent == nil then
			return nil
		end
		lastParent = lastParent:FindFirstChild(segment)
	end

	return lastParent
end

return unwrapPath