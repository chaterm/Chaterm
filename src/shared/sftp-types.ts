export type SftpDownloadFileArgs = {
  id: string
  remotePath: string
} &
  // Full path explicitly selected through the save dialog.
  (
    | { localPath: string; localDir?: never; fileName?: never }
    // Drag-and-drop: keep the selected directory separate from the untrusted SFTP entry name.
    | { localDir: string; fileName: string; localPath?: never }
  )
