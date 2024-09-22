const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path'); // Required for absolute paths
require('dotenv').config();

//implemented from Github restapi documentation 
const { Octokit } = require('@octokit/rest');


const app = express();

// Define the subscription prompt URL
const subscribeUrl = 'https://www.youtube.com/channel/UCwk8Ji_KtnPLm2rj5XkuUZQ?sub_confirmation=1';

// Session setup
app.use(session({ 
    secret: process.env.SESSION_SECRET, 
    resave: false, 
    saveUninitialized: true 
}));
app.use(passport.initialize());
app.use(passport.session());



// Github OAuth strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/github/callback"
  }, async function (accessToken, refreshToken, profile, done) {
    try {
      const octokit = new Octokit({
        auth: accessToken
      });
  
      //  Check if authenticated user is following the target user
      //replace Ayush78516 with byte's username since this for testing and i don't have authorization 
      const targetUsername = 'Ayush78516';
      const response = await octokit.request(`GET /user/following/${targetUsername}`, {
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
  
      // Check if the user is following Ayush78516
      if (response.status === 204) {
        return done(null, { profile, isFollowing: true });
      } else {
        return done(null, { profile, isFollowing: false });
      }
    } catch (error) {
      console.error('Error during GitHub follow check:', error.response ? error.response.data : error.message);
      return done(error);
    }
  }));
  


// YouTube OAuth strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback",
    scope: ['https://www.googleapis.com/auth/youtube.readonly', 'profile', 'email'] // Added consistent scopes
}, async function(accessToken, refreshToken, profile, done) {
    console.log('Access Token:', accessToken);
    console.log('Profile:', profile);

    const oauth2Client = new google.auth.OAuth2(); // Create OAuth2 client
    oauth2Client.setCredentials({ access_token: accessToken }); // Use access token

    const youtube = google.youtube({
        version: 'v3',
        auth: oauth2Client // Pass OAuth2 client
    });

    try {
        const response = await youtube.subscriptions.list({
            part: 'snippet',
            mine: true,
            forChannelId: 'UCwk8Ji_KtnPLm2rj5XkuUZQ', // Replace with byte's channel ID
        });

        console.log('Subscriptions Response:', response.data);

        if (response.data.items.length > 0) {
            // User is subscribed to the channel
            return done(null, { profile, isSubscribed: true }); // Pass subscription status
        } else {
            // User is not subscribed
            return done(null, { profile, isSubscribed: false });
        }
    } catch (error) {
        console.error('Error in YouTube API:', error);
        return done(error);
    }
}));

// Serialize and deserialize user for session
passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

// Routes for GitHub OAuth
app.get('/auth/github', passport.authenticate('github', { scope: ['user:follow'] }));

app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/login' }),
    function(req, res) {
        if (req.user.isFollowing) {
            res.redirect('/protected');
        } else {
            res.redirect('/follow-github'); // Ask to follow GitHub if not already following
        }
    }
);

// Routes for YouTube OAuth
app.get('/auth/google', passport.authenticate('google', { scope: ['https://www.googleapis.com/auth/youtube.readonly', 'profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    function(req, res) {
        // Check if user is already subscribed to the channel
        if (req.user.isSubscribed) {
            res.redirect('/protected');
        } else {
            res.redirect(subscribeUrl); // Redirect to subscription prompt
        }
    }
);

// Route for protected page
app.get('/protected', ensureAuthenticated, function(req, res) {
    const protectedPath = path.resolve('project', 'views', 'protected.html');
    res.sendFile(protectedPath); // Correct path
});

// Route for login page
app.get('/login', (req, res) => {
    const loginPath = path.resolve('project', 'views', 'login.html');
    res.sendFile(loginPath); // Correct path
});


// Route for GitHub follow page (when user needs to follow on GitHub)
app.get('/follow-github', (req, res) => {
    res.send('Please follow Ayush78516 on GitHub to continue.');
});


// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login');
}

// Add route for root URL (to fix the 404 error)
app.get('/', (req, res) => {
    res.redirect('/login'); // Redirect to login page
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running');
});
