-- Reference material: Word (.docx) and PowerPoint (.pptx) files as well as PDFs.
-- The server reads their text and stores long ones as plain-text parts
-- (chunks/<resource>/chunk_N.txt), the way big PDFs are stored as page ranges.

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'text/plain'
   ]
 where id = 'curriculum-resources';
