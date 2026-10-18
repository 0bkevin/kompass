# Native resource-library journey

**Result: passed; no new resource-library defects found.** Tested 2026-10-18 using the current production build in the native collaborative browser, desktop 1280×800 and mobile 390×844.

The isolated host was `http://127.0.0.85:5505`, with `DATA_DIR=/tmp/radar-real-30x-assets-20261018`, discovery disabled and no AI or external-provider credentials. Account registration was completed through the UI. A separate company named **30X Recursos QA** was created through the authenticated API as test setup; this asset review did not repeat the main journey's company-onboarding steps. All subsequent upload, download, draft creation, attachment, detachment and deletion actions used the actual UI. State reads verified persistence.

The two documents were written specifically for this test. They contain no copied 30X course material, images, testimonials or personal records. The company website was retained as a link and was not ingested. No external publication or AI request occurred.

## Verified behavior

| Action                                                                         | Observed result                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open **Subir archivos**                                                        | Native file chooser appeared with multiple selection and advertised supported formats.                                                                                                                    |
| Upload original Markdown, TXT and an intentionally unsupported `.exe` together | Both valid documents returned HTTP 201 and remained in the library. The unsupported file returned HTTP 400. The UI showed each filename and outcome plus an accurate partial-success message.             |
| Open the Markdown resource                                                     | Accessible named document modal opened with **Descargar original**. This is an original-file download, not an inline text viewer.                                                                         |
| Download and read the original                                                 | Browser download completed with the original filename. Its 288 bytes matched the uploaded file exactly and decoded as UTF-8. SHA-256: `5dd4bced518414e0555e3be7a2016de11e6eac9b0e6d0759c0b53786c0932b94`. |
| Create a draft from an original QA topic                                       | The local structure opened in the editor, correctly labeled **Estructura local**.                                                                                                                         |
| Select both documents under **Recursos**, save and reload                      | Both associations persisted in the stored piece and reappeared as checked controls.                                                                                                                       |
| On mobile, uncheck TXT and save                                                | The TXT resource was detached while remaining available in the library. No horizontal page overflow.                                                                                                      |
| Delete the still-associated Markdown resource                                  | The UI requested confirmation for the correct filename. Accepting removed the resource and automatically removed its association from the draft; TXT remained.                                            |
| Reload the piece after deletion                                                | Only the surviving TXT appeared, unchecked. The deleted original-file URL returned HTTP 404. The piece remained an editable draft.                                                                        |

The console's HTTP 400 resource message corresponded to the deliberate invalid upload. The final HTTP 404 corresponded to the explicit deleted-file check. No uncaught application exception was observed. Two automation calls required corrected locator/dialog arguments; they were harness-argument errors rather than application failures.

## Evidence

- [Desktop mixed-upload results](evidence/assets/01-mixed-upload-results-desktop.png)
- [Both resources attached](evidence/assets/02-resources-attached-desktop.png)
- [Mobile detachment](evidence/assets/03-resource-detach-mobile.png)
- [Mobile deletion](evidence/assets/04-resource-deletion-mobile.png)
- [Structured observations](assets.json)
- [Original Markdown fixture](evidence/assets/original-qa-document.md) and [original TXT fixture](evidence/assets/original-qa-notes.txt)

The temporary server was stopped after testing. This review does not establish live Instagram ingestion, rights to official 30X resources, AI interpretation of attachments, or automatic publishing.
