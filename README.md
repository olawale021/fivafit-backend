# StepFit Backend

A Node.js backend API for the StepFit mobile application with Supabase authentication integration.

## 🚀 Features

- **Supabase Authentication**: JWT token verification and user management
- **Express.js Server**: RESTful API with CORS support
- **Environment Configuration**: Secure environment variable management
- **Health Checks**: Server and Supabase connection monitoring
- **Error Handling**: Comprehensive error handling and logging
- **Development Ready**: Hot-reloading with nodemon

## 📁 Project Structure

```
stepfit-backend/
├── src/
│   ├── config/
│   │   └── supabase.js          # Supabase client configuration
│   ├── middleware/
│   │   └── auth.js              # Authentication middleware
│   ├── routes/
│   │   └── auth.js              # Authentication routes
│   └── server.js                # Main server file
├── .env.example                 # Environment variables example
├── .gitignore                   # Git ignore rules
├── package.json                 # Project dependencies and scripts
└── README.md                    # Project documentation
```

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd stepfit-backend
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` file with your Supabase project details:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 3. Get Supabase Credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy the following:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

### 4. Start the Server

For development (with hot-reloading):
```bash
npm run dev
```

For production:
```bash
npm start
```

## 📍 API Endpoints

### Health Checks

- **GET** `/` - Server health check
- **GET** `/api/health/supabase` - Supabase connection test

### Authentication

- **POST** `/api/auth/verify` - Verify JWT token
- **GET** `/api/auth/profile` - Get user profile (requires auth)
- **POST** `/api/auth/refresh` - Refresh access token

## 🔐 Authentication

The API uses Supabase JWT tokens for authentication. Include the token in the Authorization header:

```bash
Authorization: Bearer your_jwt_token_here
```

### Example API Calls

#### Verify Token
```bash
curl -X POST http://localhost:3001/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "your_jwt_token"}'
```

#### Get User Profile
```bash
curl -X GET http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer your_jwt_token"
```

## 🧪 Testing the Setup

1. Start the server: `npm run dev`
2. Visit `http://localhost:3001` - should show server status
3. Visit `http://localhost:3001/api/health/supabase` - should confirm Supabase connection

## 📱 Mobile App Integration

### CORS Configuration

The server is configured to accept requests from:
- `http://localhost:3000` (React web apps)
- `http://localhost:8081` (Expo development)
- `exp://localhost:8081` (Expo development)

Update the CORS origins in `src/server.js` to match your development environment.

### Expo Integration

In your React Native/Expo app, use this base URL:

```javascript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001' 
  : 'https://your-production-api.com'
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ |
| `PORT` | Server port (default: 3001) | ❌ |
| `NODE_ENV` | Environment (development/production) | ❌ |

## 🚨 Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error type",
  "message": "Human-readable error description",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 📝 Logging

The server logs all requests and important operations:
- 📝 Request logging with timestamps
- ✅ Success operations
- ❌ Error conditions
- 🔍 Authentication attempts

## 🔄 Development

### Hot Reloading

The development server uses `nodemon` for automatic restarts on file changes.

### Project Standards

- ES6 modules (`import/export`)
- Async/await for promises
- Comprehensive error handling
- Consistent logging with emojis
- Environment-based configuration

## 📚 Dependencies

### Production
- `@supabase/supabase-js` - Supabase client library
- `express` - Web application framework
- `cors` - Cross-Origin Resource Sharing
- `dotenv` - Environment variable loader

### Development
- `nodemon` - Development server with hot-reloading

## 🚀 Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use production Supabase credentials
3. Configure proper CORS origins
4. Set up process management (PM2, Docker, etc.)
5. Enable HTTPS/SSL

## 🐛 Troubleshooting

### Common Issues

1. **Supabase Connection Failed**
   - Verify your `.env` file has correct credentials
   - Check Supabase project URL format
   - Ensure service role key has proper permissions

2. **CORS Errors**
   - Add your frontend URL to CORS origins
   - Check if running on correct ports

3. **Authentication Errors**
   - Verify JWT token is valid and not expired
   - Check Authorization header format

### Debug Mode

Set `NODE_ENV=development` for detailed error logging.

## 📄 License

MIT License - see LICENSE file for details.

## 👥 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and test
4. Submit a pull request

---

**StepFit Backend** - Built with ❤️ for the StepFit mobile application