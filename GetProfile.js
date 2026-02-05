const fetch = require('node-fetch');
const csv = require('csv-parser');
const { Readable } = require('stream');

async function getUserImageById(userId) {
  const response = await fetch('https://wpu.learnx.ac.pg/export/users_export.csv');
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  return new Promise((resolve, reject) => {
    let imageUrl = null;

    const headers = [
      'course_ids', 'course_names', 'user_id', 'username',
      'firstname', 'lastname', 'email', 'picture',
      'profile_image_normal', 'profile_image_small'
    ];

    response.body
      .pipe(csv({
        separator: '\t',
        headers: headers,
        skipLines: 1 
      }))
      .on('data', (row) => {
        if (String(row.user_id).trim() === String(userId).trim()) {
          imageUrl = row.profile_image_normal;
        }
      })
      .on('end', () => {
        console.log(`Search complete for User ID: ${userId}. Image found: ${!!imageUrl}`);
        resolve(imageUrl);
      })
      .on('error', (err) => {
        console.error('CSV Parsing Error:', err);
        reject(err);
      });
  });
}

module.exports = { getUserImageById };
