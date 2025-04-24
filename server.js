const express = require('express');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
const session = require('express-session');

const app = express();
const port = 3000;

// Basic middleware
app.use(express.json());
app.use(express.static('scripts'));

// Add session middleware
app.use(session({
    secret: 'twin-pact-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 3600000 } // 1 hour
}));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'scripts', 'formalities.html'));
});

app.get('/quiz', (req, res) => {
    if (!req.session.userData) {
        // If no session data, redirect to form
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'scripts', 'quiz.html'));
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
    res.sendFile(path.join(__dirname, 'scripts', 'completion.html'));
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
    res.sendFile(path.join(__dirname, 'scripts', 'admin.html'));
});

// Admin-only data viewing
app.get('/view-data', adminAuth, (req, res) => {
    try {
        let data = {
            formResponses: [],
            quizResponses: [],
            combinedResponses: []
        };

        // Read form responses
        if (fs.existsSync('responses.xlsx')) {
            const formWorkbook = XLSX.readFile('responses.xlsx');
            data.formResponses = XLSX.utils.sheet_to_json(formWorkbook.Sheets['Form Responses']);
        }

        // Read quiz responses
        if (fs.existsSync('quiz_responses.xlsx')) {
            const quizWorkbook = XLSX.readFile('quiz_responses.xlsx');
            data.quizResponses = XLSX.utils.sheet_to_json(quizWorkbook.Sheets['Quiz Responses']);
        }

        // Read combined responses
        if (fs.existsSync('combined_responses.xlsx')) {
            const combinedWorkbook = XLSX.readFile('combined_responses.xlsx');
            data.combinedResponses = XLSX.utils.sheet_to_json(combinedWorkbook.Sheets['Combined Responses']);
        }

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
        
        // Load or create workbook
        let workbook;
        const filePath = 'responses.xlsx';
        
        if (fs.existsSync(filePath)) {
            workbook = XLSX.readFile(filePath);
        } else {
            workbook = XLSX.utils.book_new();
            workbook.SheetNames.push('Form Responses');
            workbook.Sheets['Form Responses'] = XLSX.utils.json_to_sheet([]);
        }
        
        // Get the existing data
        const sheet = workbook.Sheets['Form Responses'];
        const existingData = XLSX.utils.sheet_to_json(sheet);
        
        // Add new response
        existingData.push(data);
        
        // Update the sheet
        const newSheet = XLSX.utils.json_to_sheet(existingData);
        workbook.Sheets['Form Responses'] = newSheet;
        
        // Save the file
        XLSX.writeFile(workbook, filePath);
        
        // Update combined sheet
        updateCombinedSheet();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving form data:', error);
        res.status(500).json({ success: false, error: 'Failed to save data' });
    }
});

// Quiz submission endpoint
app.post('/submit-quiz', (req, res) => {
    try {
        const quizData = req.body;
        
        // Add timestamp
        quizData.timestamp = new Date().toISOString();
        
        // Get user data from session and add email to quiz data
        if (req.session.userData && req.session.userData.email) {
            quizData.email = req.session.userData.email;
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Session data not found. Please fill out the form first.' 
            });
        }
        
        let workbook;
        const filePath = 'quiz_responses.xlsx';

        // Load or create workbook
        if (fs.existsSync(filePath)) {
            workbook = XLSX.readFile(filePath);
        } else {
            workbook = XLSX.utils.book_new();
            workbook.SheetNames.push('Quiz Responses');
            workbook.Sheets['Quiz Responses'] = XLSX.utils.json_to_sheet([]);
        }

        // Get existing data
        let responses = [];
        if (workbook.SheetNames.includes('Quiz Responses')) {
            responses = XLSX.utils.sheet_to_json(workbook.Sheets['Quiz Responses']);
        }

        // Add new response
        responses.push(quizData);
        
        // Update the sheet
        const newSheet = XLSX.utils.json_to_sheet(responses);
        workbook.Sheets['Quiz Responses'] = newSheet;

        // Save the file
        XLSX.writeFile(workbook, filePath);
        
        // Update combined sheet
        updateCombinedSheet();

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