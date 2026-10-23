# Full-Stack Web Application

This is a full-stack web application with a React frontend and a Node.js/Express backend.

## Project Structure

- `Frontend/`: React application built with Vite.
- `Backend/`: Node.js Express server.

## Getting Started

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Start the server in development mode:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd Frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints
- `GET /api/health`: Health check endpoint to verify the server is running.
