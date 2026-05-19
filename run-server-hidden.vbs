Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta"
shell.Run "%ComSpec% /c """"C:\Program Files\nodejs\node.exe"" server.js > server-vbs.out.log 2> server-vbs.err.log""", 0, False
