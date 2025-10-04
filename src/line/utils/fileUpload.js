// // server/src/utils/fileUpload.js
// const multer = require('multer');
// const path = require('node:path');
// const fs = require('node:fs');
// require('dotenv').config({ path: path.join(__dirname, '../../.env') });


// const UPLOAD_DIR_RELATIVE = '../uploads'; // Relative path from src/utils
// const UPLOAD_DIR_ABSOLUTE = path.resolve(__dirname, UPLOAD_DIR_RELATIVE);

// // Ensure upload directory exists synchronously on module load
// if (!fs.existsSync(UPLOAD_DIR_ABSOLUTE)) {
//   try {
//     fs.mkdirSync(UPLOAD_DIR_ABSOLUTE, { recursive: true });
//     console.log(`📂 Upload directory successfully created at: ${UPLOAD_DIR_ABSOLUTE}`);
//   } catch (err) {
//     console.error(`❌ Critical Error: Could not create upload directory at ${UPLOAD_DIR_ABSOLUTE}. File uploads will fail.`, err);
//     // Consider exiting if file uploads are critical and directory can't be made
//     // process.exit(1);
//   }
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     // Check again if dir exists, in case it was deleted after server start
//     if (!fs.existsSync(UPLOAD_DIR_ABSOLUTE)) {
//         try {
//             fs.mkdirSync(UPLOAD_DIR_ABSOLUTE, { recursive: true });
//         } catch (err) {
//             return cb(err); // Pass error to multer
//         }
//     }
//     cb(null, UPLOAD_DIR_ABSOLUTE);
//   },
//   filename: (req, file, cb) => {
//     const originalNameSanitized = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_.-]/g, '_');
//     const extension = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, `${originalNameSanitized}-${uniqueSuffix}${extension}`);
//   },
// });

// const fileFilter = (req, file, cb) => {
//   // Define allowed MIME types (more reliable than extensions)
//   const allowedMimeTypes = [
//     'image/jpeg', 'image/png', 'image/gif', 'image/webp',
//     'application/pdf',
//     'application/msword', // .doc
//     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
//     'application/vnd.ms-excel', // .xls
//     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
//     'text/plain', // .txt
//     // Add more as needed
//   ];
//   // Define allowed extensions as a fallback or for stricter checking
//   const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
//   const fileExt = path.extname(file.originalname).toLowerCase();

//   if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExt)) {
//     cb(null, true); // Accept file
//   } else {
//     console.warn(`🚫 File rejected: ${file.originalname} (MIME: ${file.mimetype}, Ext: ${fileExt})`);
//     const error = new Error('Invalid file type or extension. Allowed types: Images, PDF, Office Documents, Text files.');
//     error.statusCode = 400; // Bad Request
//     cb(error, false); // Reject file
//   }
// };

// const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
// const MAX_FILES = parseInt(process.env.MAX_FILES_PER_UPLOAD || '5', 10);

// const upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: MAX_SIZE_MB * 1024 * 1024, // Convert MB to Bytes
//     files: MAX_FILES,                   // Max number of files in a single request
//   },
//   fileFilter: fileFilter,
// });

// module.exports = upload;