local ADDON_NAME, KOS = ...

-- Peer sync. Everyone's addon joins one password-protected channel and
-- reconciles on login: you announce your whole list, everyone merges what
-- they are missing. That way an incident logged while nobody else was
-- online still propagates at the next overlap with ANYONE, not just Heat.

local PREFIX       = "GOOPKOS"
local CHANNEL      = "goopkos"
local PASSWORD     = "gank-club-5922"   -- same for everyone; ships in the download zip
local JOIN_DELAY   = 5            -- seconds after login; lets General/Trade take their numbers first
local SEND_EVERY   = 0.25         -- throttle, or the server disconnects you
local FIELDS = { "clientId", "name", "class", "level", "kind", "note", "zone", "occurredAt", "reportedBy" }

local queue, sending = {}, false

local function esc(s)
  if s == nil then return "" end
  s = tostring(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub("\t", "\\t")
  s = s:gsub("\n", "\\n")
  return s
end

local function unesc(s)
  if s == "" then return nil end
  s = s:gsub("\\\\", "\1")
  s = s:gsub("\\t", "\t")
  s = s:gsub("\\n", "\n")
  s = s:gsub("\1", "\\")
  return s
end

local function serialize(entry)
  local parts = {}
  for i, key in ipairs(FIELDS) do parts[i] = esc(entry[key]) end
  return table.concat(parts, "\t")
end

local function deserialize(body)
  local values, i = {}, 1
  for chunk in (body .. "\t"):gmatch("(.-)\t") do
    values[FIELDS[i]] = chunk
    i = i + 1
    if i > #FIELDS then break end
  end

  local entry = {
    clientId   = unesc(values.clientId or ""),
    name       = unesc(values.name or ""),
    class      = unesc(values.class or ""),
    kind       = unesc(values.kind or ""),
    note       = unesc(values.note or ""),
    zone       = unesc(values.zone or ""),
    reportedBy = unesc(values.reportedBy or ""),
    level      = tonumber(values.level or ""),
    occurredAt = tonumber(values.occurredAt or ""),
  }

  if not entry.clientId or not entry.name or not entry.kind or not entry.occurredAt then
    return nil
  end
  return entry
end

local function channelIndex()
  local id = GetChannelName(CHANNEL)
  if id and id > 0 then return id end
  return nil
end

local function pump()
  if sending or #queue == 0 then return end
  local id = channelIndex()
  if not id then
    -- Not in the channel yet; try again shortly rather than dropping.
    C_Timer.After(2, pump)
    return
  end

  sending = true
  local msg = table.remove(queue, 1)
  C_ChatInfo.SendAddonMessage(PREFIX, msg, "CHANNEL", tostring(id))
  C_Timer.After(SEND_EVERY, function()
    sending = false
    pump()
  end)
end

local function enqueue(msg)
  if #msg > 240 then return end  -- addon messages are capped; skip the outlier
  queue[#queue + 1] = msg
  pump()
end

--- Sync channel number, or nil if we never got in. For /kos status.
function KOS:SyncChannel()
  return channelIndex()
end

--- Send one new incident to everyone online.
function KOS:Broadcast(entry)
  enqueue("v1\tNEW\t" .. serialize(entry))
end

--- Announce the whole list, so anyone missing entries catches up.
function KOS:AnnounceFull()
  local count = 0
  for _, entry in ipairs(GoopKOSDB.incidents) do
    enqueue("v1\tFULL\t" .. serialize(entry))
    count = count + 1
  end
  if count > 0 then
    print("|cffff7a18KOS|r announcing " .. count .. " incidents to the channel")
  end
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_ENTERING_WORLD")
f:RegisterEvent("CHAT_MSG_ADDON")

local joined = false

f:SetScript("OnEvent", function(_, event, ...)
  if event == "PLAYER_ENTERING_WORLD" then
    if joined then return end
    joined = true
    if GoopKOSDB and GoopKOSDB.syncOff then return end
    C_ChatInfo.RegisterAddonMessagePrefix(PREFIX)
    C_Timer.After(JOIN_DELAY, function()
      -- Don't touch the chat frames here (ChatFrame_RemoveChannel): Forever
      -- forbids it and shows the "blocked from an action" popup. Addon
      -- messages never print in chat, so the channel stays quiet anyway.
      JoinChannelByName(CHANNEL, PASSWORD)
      -- Queued now; pump() holds it until the join lands, then sends.
      KOS:AnnounceFull()
    end)

  elseif event == "CHAT_MSG_ADDON" then
    local prefix, text, _, sender = ...
    if prefix ~= PREFIX then return end
    if sender then
      local who = Ambiguate(sender, "none")
      if who == UnitName("player") or who == KOS.FullName("player") then return end
    end

    local version, kind, body = text:match("^(.-)\t(.-)\t(.*)$")
    if version ~= "v1" then return end
    if kind ~= "NEW" and kind ~= "FULL" then return end

    local entry = deserialize(body)
    if not entry then return end

    if KOS:Merge(entry) then
      if KOS.RefreshNameplates then KOS:RefreshNameplates() end
      if kind == "NEW" then
        print("|cffff7a18KOS|r " .. entry.name .. " added by " .. (entry.reportedBy or "someone"))
      end
    end
  end
end)
