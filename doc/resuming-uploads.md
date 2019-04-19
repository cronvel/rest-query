
## Resuming uploads

The client must send a `X-Upload-Resume-Offset: [bytes]` header or a `Content-Disposition: [...] ; X-Upload-Resume-Offset=[bytes]` for multipart.
Rest Query does not do anything on its part at the moment, except adding a `resumeOffset` property to AttachmentStreams.
Userland must implement it on its own.
Someday, regular attachment will implement it.
