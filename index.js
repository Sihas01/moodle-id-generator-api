const bodyParser = require('body-parser');
const express = require('express');
const QRCode = require('qrcode');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { getUserImageById } = require('./GetProfile');

let logoBase64 = '';
try {
  const logoPath = path.join(__dirname, 'public', 'LearnXPlus_Final_Logo.png');
  const logoData = fs.readFileSync(logoPath);
  logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;
} catch (err) {
  console.error('Failed to load logo for Base64 conversion:', err.message);
}

const app = express();

app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

app.use(express.static('public'));

// CORS Middleware to allow ngrok bypass header
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, ngrok-skip-browser-warning');

  // Log every request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.set('view engine', 'ejs');

app.set('trust proxy', true);

const getBaseUrl = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
};

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
  const email = req.body.email || req.body.lis_person_contact_email_primary || '';

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
        qr_code: null,
        logo_base64: logoBase64,
        base_url: getBaseUrl(req)
      });
    }

    const bUrl = getBaseUrl(req);

    res.render('idcard', {
      user_id: userId,
      name: fullName,
      roles: roles,
      profile_image: profileImage,
      email: email,
      courses: courses,
      qr_code: url,
      logo_base64: logoBase64,
      base_url: bUrl
    });
  });
});

// Mobile endpoint that accepts JSON POST data
app.post('/lti/launch/mobile', async (req, res) => {
  console.log('--- NEW MOBILE LAUNCH REQUEST ---');
  console.log('Time:', new Date().toISOString());
  console.log('User-Agent:', req.headers['user-agent']);

  // Handle both JSON and form-encoded data
  const userId = req.body.user_id || req.body.data?.user_id;
  const fullName = req.body.name || req.body.data?.name || 'Unknown User';
  const roles = req.body.roles || req.body.data?.roles || 'Student';
  const email = req.body.email || req.body.data?.email || '';

  if (!userId) {
    console.warn('WARNING: Received request with no user_id. Body:', JSON.stringify(req.body));
  }

  console.log(`Processing ID for: ${fullName} (${userId})`);

  let profileImage = '';
  try {
    const fetchWithTimeout = async (url, timeout = 5000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    };

    const imageUrl = await getUserImageById(userId);
    if (imageUrl) {
      console.log(`Fetching profile image for user ${userId} from: ${imageUrl}`);
      const imgRes = await fetchWithTimeout(imageUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.buffer();
        const contentType = imgRes.headers.get('content-type');
        profileImage = `data:${contentType};base64,${buffer.toString('base64')}`;
        console.log('Successfully converted profile image to Base64');
      } else {
        console.error(`Failed to fetch image: ${imgRes.status}`);
      }
    }
  } catch (err) {
    console.error('Failed to fetch/convert profile image:', err.message);
  }

  let coursesRaw = req.body.courses || req.body.data?.courses || '';
  let courses = coursesRaw ? coursesRaw.split(',').map(c => c.trim()).filter(c => c.length > 0) : ['Unknown Course'];

  console.log('Generating QR Code...');
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
        qr_code: null,
        logo_base64: logoBase64,
        base_url: getBaseUrl(req)
      });
    }

    console.log('Rendering ID card...');
    const bUrl = getBaseUrl(req);
    console.log('Server-side Detected Base URL:', bUrl);

    res.render('idcard', {
      user_id: userId,
      name: fullName,
      roles: roles,
      profile_image: profileImage,
      email: email,
      courses: courses,
      qr_code: url,
      logo_base64: logoBase64,
      base_url: bUrl
    });
  });
});


app.listen(3000, () => {
  console.log('Server is running on port 3000');
});