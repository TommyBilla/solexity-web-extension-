const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
// Increase JSON limit to handle base64 images
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Simple schema to log questions (optional)
const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Question = mongoose.model('Question', questionSchema);

// AI API function with multiple fallbacks
const queryAI = async (question) => {
  const API_KEY = process.env.GEMINI_API_KEY;
  
  // Define multiple models to try in order of preference
  const geminiModels = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-pro',
    'gemini-pro-vision'
  ];
  
  // Try Gemini models if API key is available
  if (API_KEY) {
    console.log('🔑 Gemini API Key found, trying Gemini models...');
    
    for (const model of geminiModels) {
      try {
        console.log(`🤖 Trying Gemini model: ${model}`);
        const response = await tryGeminiModel(question, model, API_KEY);
        if (response) {
          console.log(`✅ Success with ${model}`);
          return response;
        }
      } catch (error) {
        console.log(`❌ ${model} failed: ${error.message}`);
        continue;
      }
    }
    
    console.log('⚠️ All Gemini models failed, trying other options...');
  } else {
    console.log('🔑 No Gemini API key found, skipping Gemini...');
  }
  
  // Try free alternatives
  const alternatives = [
    () => tryHuggingFace(question),
    () => tryOpenAI(question),
    () => tryLocalLLM(question)
  ];
  
  for (const [index, tryAPI] of alternatives.entries()) {
    try {
      console.log(`🔄 Trying alternative API ${index + 1}...`);
      const response = await tryAPI();
      if (response) {
        console.log(`✅ Success with alternative API ${index + 1}`);
        return response;
      }
    } catch (error) {
      console.log(`❌ Alternative API ${index + 1} failed: ${error.message}`);
      continue;
    }
  }
  
  // Final fallback - smart mock responses
  console.log('🎭 All APIs failed, using intelligent fallback...');
  return getSmartFallbackResponse(question);
};

// Analyze image (base64) using Gemini Vision if available, with graceful fallback
const analyzeImageAI = async (base64Image, prompt) => {
  const API_KEY = process.env.GEMINI_API_KEY;
  const model = 'gemini-1.5-pro-latest';

  if (API_KEY) {
    try {
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const { data: result } = await axios.post(API_URL, {
        contents: [
          {
            parts: [
              { text: prompt || 'Provide a concise description of this image.' },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: base64Image.replace(/^data:image\/[^;]+;base64,/, ''),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 512,
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      if (
        result.candidates &&
        result.candidates[0] &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts[0].text
      ) {
        return result.candidates[0].content.parts[0].text;
      }

      throw new Error('Invalid response format');
    } catch (err) {
      console.warn('⚠️ Gemini vision analyze failed, falling back:', err.message);
    }
  }

  // Fallback if no API or failed
  return 'Image analysis is unavailable right now. Ensure GEMINI_API_KEY is set. Received an image and would normally return a description.';
};

// Try specific Gemini model
const tryGeminiModel = async (question, modelName, apiKey) => {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const { data: result } = await axios.post(API_URL, {
    contents: [{ parts: [{ text: question }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    }
  }, { headers: { 'Content-Type': 'application/json' } });
  
  if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
    return result.candidates[0].content.parts[0].text;
  }
  
  throw new Error('Invalid response format');
};

// Try Hugging Face as backup
const tryHuggingFace = async (question) => {
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error('No Hugging Face API key');
  }
  
  const models = ['google/flan-t5-small', 'microsoft/DialoGPT-medium', 'gpt2'];
  for (const model of models) {
    try {
      const { data: result } = await axios.post(`https://api-inference.huggingface.co/models/${model}`,
        { inputs: question },
        { headers: { 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      return Array.isArray(result) ? result[0].generated_text : result.generated_text;
    } catch (error) {
      continue;
    }
  }
  
  throw new Error('All HuggingFace models failed');
};

// Try OpenAI (if user has key)
const tryOpenAI = async (question) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('No OpenAI API key');
  }
  
  const { data: result } = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: question }],
    max_tokens: 500,
  }, { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } });
  return result.choices[0].message.content;
};

// Try local LLM (placeholder for future implementation)
const tryLocalLLM = async (question) => {
  // Could implement Ollama, local models, etc.
  throw new Error('Local LLM not implemented');
};

// Smart fallback with context-aware responses
const getSmartFallbackResponse = (question) => {
  const lowerQ = question.toLowerCase();
  
  // Programming questions
  if (lowerQ.includes('javascript') || lowerQ.includes('js')) {
    return "JavaScript is a versatile programming language primarily used for web development. It runs in browsers and servers (Node.js), enabling interactive websites, web applications, and even mobile apps. Key features include dynamic typing, event-driven programming, and a vast ecosystem of libraries and frameworks like React, Vue, and Express.";
  }
  
  if (lowerQ.includes('python')) {
    return "Python is a high-level, interpreted programming language known for its simple and readable syntax. It's widely used in web development, data science, artificial intelligence, automation, and scientific computing. Python's philosophy emphasizes code readability and simplicity, making it an excellent choice for beginners and experts alike.";
  }
  
  if (lowerQ.includes('react')) {
    return "React is a popular JavaScript library for building user interfaces, particularly web applications. Created by Facebook, it uses a component-based architecture and virtual DOM for efficient rendering. React makes it easier to create interactive UIs by breaking them down into reusable components.";
  }
  
  // AI/Tech questions
  if (lowerQ.includes('ai') || lowerQ.includes('artificial intelligence')) {
    return "Artificial Intelligence (AI) refers to computer systems that can perform tasks typically requiring human intelligence, such as learning, reasoning, problem-solving, and understanding language. Modern AI includes machine learning, deep learning, and neural networks, powering applications like voice assistants, recommendation systems, and autonomous vehicles.";
  }
  
  if (lowerQ.includes('machine learning') || lowerQ.includes('ml')) {
    return "Machine Learning is a subset of AI that enables computers to learn and improve from experience without being explicitly programmed. It uses algorithms to analyze data, identify patterns, and make predictions or decisions. Common types include supervised learning, unsupervised learning, and reinforcement learning.";
  }
  
  // General programming
  if (lowerQ.includes('code') || lowerQ.includes('programming') || lowerQ.includes('software')) {
    return "Programming is the process of creating instructions for computers to execute. It involves writing code in programming languages, solving problems algorithmically, and building software applications. Key concepts include variables, functions, loops, conditionals, and data structures.";
  }
  
  // Web development
  if (lowerQ.includes('web') || lowerQ.includes('website') || lowerQ.includes('html') || lowerQ.includes('css')) {
    return "Web development involves creating websites and web applications using technologies like HTML (structure), CSS (styling), and JavaScript (interactivity). It includes frontend development (user interface) and backend development (server-side logic, databases). Modern web development often uses frameworks and tools for efficiency.";
  }
  
  // Default intelligent response
  return `I understand you're asking about "${question}". While I'm currently running in offline mode, I can tell you that this is an interesting topic worth exploring! For the most accurate and up-to-date information, you might want to try again when my AI services are fully available, or consult reliable sources online.`;
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Solexity AI Assistant Backend is running!', 
    status: 'active',
    endpoints: {
      ask: 'POST /ask - Send a question to get AI response',
      summarize: 'POST /summarize - { text } -> AI summary',
      analyzeImage: 'POST /analyze-image - { imageBase64, prompt? } -> AI description'
    }
  });
});

app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    // Validate input
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Question is required and must be a non-empty string' 
      });
    }

    console.log('📝 Received question:', question);

    // Get AI response with multiple fallbacks
    const answer = await queryAI(question.trim());

    // Save to database (optional logging)
    try {
      const questionDoc = new Question({
        question: question.trim(),
        answer: answer
      });
      await questionDoc.save();
      console.log('💾 Question and answer saved to database');
    } catch (dbError) {
      console.warn('⚠️ Failed to save to database:', dbError.message);
      // Don't fail the request if DB save fails
    }

    // Return response
    res.json({ answer });
    console.log('✅ Response sent successfully');

  } catch (error) {
    console.error('🔥 Error in /ask endpoint:', error.message);
    
    // Return appropriate error response
    if (error.message.includes('Failed to get response from AI model')) {
      res.status(503).json({ 
        error: 'AI service temporarily unavailable. Please try again later.' 
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error. Please try again later.' 
      });
    }
  }
});

// Summarize route
app.post('/summarize', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text is required and must be a non-empty string' });
    }

    const prompt = `Summarize the following text in 3-5 bullet points, focusing on key insights and being concise.\n\nText:\n${text.trim()}`;
    const answer = await queryAI(prompt);
    // Save
    try {
      const doc = new Question({ question: text.trim(), answer });
      await doc.save();
    } catch (e) {
      console.warn('⚠️ Failed to save summarize history:', e.message);
    }
    res.json({ summary: answer });
  } catch (error) {
    console.error('🔥 Error in /summarize:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analyze image route
app.post('/analyze-image', async (req, res) => {
  try {
    const { imageBase64, prompt } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 is required (data URL or base64 string)' });
    }

    const description = await analyzeImageAI(imageBase64, prompt);
    // Save
    try {
      const doc = new Question({ question: prompt ? `[image] ${prompt}` : '[image]', answer: description });
      await doc.save();
    } catch (e) {
      console.warn('⚠️ Failed to save analyze-image history:', e.message);
    }
    res.json({ description });
  } catch (error) {
    console.error('🔥 Error in /analyze-image:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// History (latest first)
app.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const items = await Question.find({}).sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ items });
  } catch (e) {
    console.error('🔥 Error in /history:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 Solexity backend server running on port ${PORT}`);
      console.log(`📍 Health check available at http://localhost:${PORT}/health`);
      console.log(`🤖 AI endpoint available at http://localhost:${PORT}/ask`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
});

// Start the server
startServer();

module.exports = app;