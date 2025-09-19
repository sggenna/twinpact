const express = require('express');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const session = require('express-session');

// In-memory data storage for serverless compatibility
let responsesData = [];
let quizData = [];

const app = express();
const port = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/scripts', express.static('scripts'));
app.use(express.static('.')); // Serve static files from root directory

// Add session middleware
app.use(session({
    secret: 'twin-pact-secret-key',
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: false, 
        maxAge: 3600000, // 1 hour
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Static file routes
app.get('/formalities.css', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'css', 'formalities.css'));
});

app.get('/quiz.css', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'css', 'quiz.css'));
});

app.get('/index.css', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'css', 'index.css'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'js', 'script.js'));
});

app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'logo.png'));
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
});

app.get('/formalities', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'formalities.html'));
});

app.get('/quiz', (req, res) => {
    if (!req.session.userData) {
        // If no session data, redirect to form
        return res.redirect('/formalities');
    }
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'quiz.html'));
});

app.get('/completion', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'completion.html'));
});

// Check if user has session data
app.get('/check-session', (req, res) => {
    if (req.session.userData && req.session.userData.email) {
        res.json({ 
            hasSession: true, 
            userData: {
                email: req.session.userData.email,
                name: req.session.userData.name
            }
        });
    } else {
        res.json({ hasSession: false });
    }
});

app.get('/completion', (req, res) => {
    res.sendFile(path.join(__dirname, 'completion.html'));
});

// Simple admin authentication
const adminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Access"');
        return res.status(401).send('Authentication required');
    }
    
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');
    
    if (username === 'h4VajHM9il4lzqL' && password === 'srL5VkHpon8NT86') {
        return next();
    }
    
    res.set('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Invalid credentials');
};

// Admin routes
app.get('/admin', adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'admin.html'));
});

// API endpoint to get data as JSON (for debugging)
app.get('/api/data', (req, res) => {
    try {
        const combinedData = [];
        responsesData.forEach(form => {
            const quiz = quizData.find(q => q.email === form.email);
            combinedData.push({
                ...form,
                ...quiz,
                form_submitted_at: form.timestamp,
                quiz_submitted_at: quiz ? quiz.timestamp : null
            });
        });

        res.json({
            formResponses: responsesData,
            quizResponses: quizData,
            combinedResponses: combinedData,
            stats: {
                totalForms: responsesData.length,
                totalQuizzes: quizData.length,
                completedProfiles: combinedData.length
            }
        });
    } catch (error) {
        console.error('Error getting data:', error);
        res.status(500).json({ error: 'Failed to get data' });
    }
});

// Admin-only data viewing
app.get('/view-data', adminAuth, (req, res) => {
    try {
        // Create combined data
        const combinedData = [];
        responsesData.forEach(form => {
            const quiz = quizData.find(q => q.email === form.email);
            combinedData.push({
                ...form,
                ...quiz,
                form_submitted_at: form.timestamp,
                quiz_submitted_at: quiz ? quiz.timestamp : null
            });
        });

        let data = {
            formResponses: responsesData,
            quizResponses: quizData,
            combinedResponses: combinedData
        };

        // Create HTML response with escape for safety
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>TwinPact Data</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    h2 { color: #333; }
                </style>
            </head>
            <body>
                <h1>TwinPact Data</h1>
                
                <h2>Form Responses (${data.formResponses.length})</h2>
                <table>
                    <tr>
                        ${Object.keys(data.formResponses[0] || {}).map(key => `<th>${key}</th>`).join('')}
                    </tr>
                    ${data.formResponses.map(row => `
                        <tr>
                            ${Object.values(row).map(value => `<td>${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </table>

                <h2>Quiz Responses (${data.quizResponses.length})</h2>
                <table>
                    <tr>
                        ${Object.keys(data.quizResponses[0] || {}).map(key => `<th>${key}</th>`).join('')}
                    </tr>
                    ${data.quizResponses.map(row => `
                        <tr>
                            ${Object.values(row).map(value => `<td>${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </table>

                <h2>Combined Responses (${data.combinedResponses.length})</h2>
                <table>
                    <tr>
                        ${Object.keys(data.combinedResponses[0] || {}).map(key => `<th>${key}</th>`).join('')}
                    </tr>
                    ${data.combinedResponses.map(row => `
                        <tr>
                            ${Object.values(row).map(value => `<td>${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}
                        </tr>
                    `).join('')}
                </table>
            </body>
            </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Error reading data:', error);
        res.status(500).send('Error reading data');
    }
});

// Admin-only data clearing endpoint
app.post('/clear-data', adminAuth, (req, res) => {
    try {
        const { form = false, quiz = false, combined = false, all = false } = req.query;
        const filesToClear = [];
        
        if (all || form) {
            if (fs.existsSync('responses.xlsx')) {
                const workbook = XLSX.utils.book_new();
                workbook.SheetNames.push('Form Responses');
                workbook.Sheets['Form Responses'] = XLSX.utils.json_to_sheet([]);
                XLSX.writeFile(workbook, 'responses.xlsx');
                filesToClear.push('responses.xlsx');
            }
        }
        
        if (all || quiz) {
            if (fs.existsSync('quiz_responses.xlsx')) {
                const workbook = XLSX.utils.book_new();
                workbook.SheetNames.push('Quiz Responses');
                workbook.Sheets['Quiz Responses'] = XLSX.utils.json_to_sheet([]);
                XLSX.writeFile(workbook, 'quiz_responses.xlsx');
                filesToClear.push('quiz_responses.xlsx');
            }
        }
        
        if (all || combined) {
            if (fs.existsSync('combined_responses.xlsx')) {
                const workbook = XLSX.utils.book_new();
                workbook.SheetNames.push('Combined Responses');
                workbook.Sheets['Combined Responses'] = XLSX.utils.json_to_sheet([]);
                XLSX.writeFile(workbook, 'combined_responses.xlsx');
                filesToClear.push('combined_responses.xlsx');
            }
        }
        
        if (filesToClear.length === 0) {
            return res.status(400).json({ success: false, message: 'No files specified to clear' });
        }
        
        res.json({ 
            success: true, 
            message: 'Data cleared successfully', 
            clearedFiles: filesToClear 
        });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ success: false, error: 'Failed to clear data' });
    }
});

// Handle form submissions
app.post('/submit', (req, res) => {
    try {
        const data = req.body;
        data.timestamp = new Date().toISOString();
        
        // Store user data in session for linking with quiz later
        req.session.userData = {
            email: data.email,
            name: data.name,
            phone: data.phone,
            year: data.year,
            major: data.major,
            campus: data.campus,
            timestamp: data.timestamp
        };
        
        // Store in memory (serverless compatible)
        responsesData.push(data);
        
        console.log('Form submitted:', data.email);
        console.log('Total responses:', responsesData.length);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving form data:', error);
        res.status(500).json({ success: false, error: 'Failed to save data' });
    }
});

// Quiz submission endpoint
app.post('/submit-quiz', (req, res) => {
    try {
        const quizSubmission = req.body;
        
        // Add timestamp
        quizSubmission.timestamp = new Date().toISOString();
        
        // Get user data from session and add email to quiz data
        if (req.session.userData && req.session.userData.email) {
            quizSubmission.email = req.session.userData.email;
        } else if (quizSubmission.email) {
            // Fallback: if email is provided directly in the quiz data, use it
            console.log('Using email from quiz data:', quizSubmission.email);
        } else {
            // Try to find the most recent form submission to link with
            const recentForm = responsesData[responsesData.length - 1];
            if (recentForm && recentForm.email) {
                quizSubmission.email = recentForm.email;
                console.log('Linked quiz to recent form submission:', recentForm.email);
            } else {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No user data found. Please fill out the form first and try again.' 
                });
            }
        }
        
        // Store in memory (serverless compatible)
        quizData.push(quizSubmission);
        
        console.log('Quiz submitted for:', quizSubmission.email);
        console.log('Total quiz responses:', quizData.length);
        
        res.status(200).json({ success: true, message: 'Quiz submitted successfully' });
    } catch (error) {
        console.error('Error saving quiz response:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Function to update the combined sheet
function updateCombinedSheet() {
    try {
        let workbook;
        const combinedFilePath = 'combined_responses.xlsx';
        
        // Load or create workbook
        if (fs.existsSync(combinedFilePath)) {
            workbook = XLSX.readFile(combinedFilePath);
        } else {
            workbook = XLSX.utils.book_new();
            workbook.SheetNames.push('Combined Responses');
            workbook.Sheets['Combined Responses'] = XLSX.utils.json_to_sheet([]);
        }
        
        // Load form responses
        let formResponses = [];
        if (fs.existsSync('responses.xlsx')) {
            const formWorkbook = XLSX.readFile('responses.xlsx');
            formResponses = XLSX.utils.sheet_to_json(formWorkbook.Sheets['Form Responses']);
        }
        
        // Load quiz responses
        let quizResponses = [];
        if (fs.existsSync('quiz_responses.xlsx')) {
            const quizWorkbook = XLSX.readFile('quiz_responses.xlsx');
            quizResponses = XLSX.utils.sheet_to_json(quizWorkbook.Sheets['Quiz Responses']);
        }
        
        // Create a map of all unique emails
        const allEmails = new Set([
            ...formResponses.map(form => form.email?.toLowerCase()),
            ...quizResponses.map(quiz => quiz.email?.toLowerCase())
        ].filter(Boolean));
        
        // Combine all responses, starting with quiz data and adding form data if available
        const combinedData = [];
        
        allEmails.forEach(email => {
            const quiz = quizResponses.find(q => q.email?.toLowerCase() === email);
            const form = formResponses.find(f => f.email?.toLowerCase() === email);
            
            if (quiz || form) {
                combinedData.push({
                    // Common identifier fields first
                    email: (quiz || form).email,
                    name: form ? form.name : 'Unknown',
                    phone: form ? form.phone : null,
                    year: form ? form.year : null,
                    major: form ? form.major : null,
                    campus: form ? form.campus : null,
                    
                    // Include quiz data if available
                    ...(quiz || {}),
                    
                    // Timestamps
                    form_submitted_at: form ? form.timestamp : null,
                    quiz_submitted_at: quiz ? quiz.timestamp : null
                });
            }
        });
        
        // Update the combined sheet
        const newSheet = XLSX.utils.json_to_sheet(combinedData);
        workbook.Sheets['Combined Responses'] = newSheet;
        
        // Save the file
        XLSX.writeFile(workbook, combinedFilePath);
        
        console.log(`Combined sheet updated: ${combinedData.length} entries processed.`);
    } catch (error) {
        console.error('Error updating combined sheet:', error);
    }
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});