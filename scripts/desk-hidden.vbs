' Runs scripts/desk.ts with no console window (for Windows Task Scheduler).
'   wscript.exe scripts\desk-hidden.vbs remind
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
args = ""
For Each a In WScript.Arguments
  args = args & " " & a
Next
WScript.Quit sh.Run("node """ & dir & "\desk.ts""" & args, 0, True)
