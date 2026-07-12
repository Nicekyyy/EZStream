!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Terminating running ezstream processes..."
  nsExec::Exec 'taskkill /F /IM ezstream.exe'
  nsExec::Exec 'taskkill /F /IM node-x86_64-pc-windows-msvc.exe'
  Sleep 1000
!macroend
