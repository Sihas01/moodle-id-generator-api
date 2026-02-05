const bodyParser = require('body-parser');
const express = require('express');
const QRCode = require('qrcode');
const fetch = require('node-fetch');
const { getUserImageById } = require('./GetProfile');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static('public'));

app.set('view engine', 'ejs');

//to check server is live
app.get('/', (req, res) => {
  res.send('LTI app running');
});

app.post('/lti/login', (req, res) => {
  console.log('LTI login endpoint hit');
  console.log('Request body:', req.body);

  res.send('LTI data received');
});

app.get("/lti/launch", (req, res) => {
  res.send(`
    <h1>LTI Launch</h1>
    <p>This page is only reachable via Moodle POST for real user data.</p>
    <p>For testing, click your tool from a course to see user info.</p>
  `);
});

app.post('/lti/launch', async (req, res) => {
  console.log('LTI 1.1 launch hit:', req.body);

  const userId = req.body.user_id;
  const fullName = req.body.name || 'Unknown User';
  const roles = req.body.roles || 'Student';
  let profileImage = '';
  try {
    const imageUrl = await getUserImageById(userId);
    if (imageUrl) {
      console.log(`Fetching profile image for user ${userId} from: ${imageUrl}`);
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.buffer();
        const contentType = imgRes.headers.get('content-type');
        profileImage = `data:${contentType};base64,${buffer.toString('base64')}`;
        console.log('Successfully converted profile image to Base64');
      } else {
        console.error(`Failed to fetch image: ${imgRes.status} ${imgRes.statusText}`);
      }
    }
  } catch (err) {
    console.error('Failed to fetch/convert profile image:', err);
  }
  const email = req.body.lis_person_contact_email_primary || '';

  let coursesRaw = req.body.courses || req.body.context_title || '';
  let courses = [];
  if (coursesRaw) {

    courses = coursesRaw.split(',').map(c => c.trim()).filter(c => c.length > 0);
  } else {
    courses = ['Unknown Course'];
  }

  const userData = `BEGIN:VCARD
VERSION:3.0
FN:${fullName}
EMAIL;TYPE=INTERNET:${email}
NOTE:Student ID: ${userId}, Role: ${roles}
END:VCARD`;

  QRCode.toDataURL(userData, { errorCorrectionLevel: 'H' }, (err, url) => {
    if (err) {
      console.error('QR Code generation error:', err);
      return res.render('idcard', {
        user_id: userId,
        name: fullName,
        roles: roles,
        profile_image: profileImage,
        email: email,
        courses: courses,
        qr_code: null
      });
    }

    res.render('idcard', {
      user_id: userId,
      name: fullName,
      roles: roles,
      profile_image: profileImage,
      email: email,
      courses: courses,
      qr_code: url
    });
  });
});


app.listen(3000, () => {
  console.log('Server is running on port 3000');
});