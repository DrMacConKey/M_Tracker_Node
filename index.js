const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('fast-csv');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

const db = new sqlite3.Database(':memory:');
app.use(express.urlencoded({ extended: true }));

// Initialize database
db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, peer TEXT, availability BOOLEAN)');
});

// Fetch history data from GitHub at server start
async function fetchHistoryFromGitHub() {
    const response = await fetch('https://raw.githubusercontent.com/DrMacConKey/M_Tracker_Node/history.csv');
    const csvData = await response.text();

    csv.parseString(csvData, { headers: true })
        .on('data', (row) => {
            db.run('INSERT INTO history (id, date, peer, availability) VALUES (?, ?, ?, ?)', [row.id, row.date, row.peer, row.availability]);
        })
        .on('end', () => {
            console.log('History data initialized from GitHub CSV.');
        });
}

fetchHistoryFromGitHub();

const areas = ['Office', 'Central Medical Center', 'Al Adan', 'Al Ahmadi', 'Al Farwaniya', 'Al Jabrya', 'Al Jahra', 'Al Riggae', 'Al Salmiya', 'Bneid Al Qar', 'Fahaheel', 'Fintas', 'Hawalli', 'Jabiryia', 'Jeleeb Al Shuyoukh', 'Khaitan', 'Kuwait City', 'Mahboula', 'Mangaf', 'Sabah Al Salem', 'Shaa\'ab'];

app.get('/', (req, res) => {
    let areaOptions = areas.map(area => `<option value="${area}">${area}</option>`).join('');
    res.send(`
        <html>
        <head>
            <title>Manager Tracker</title>
        </head>
        <body>
            <form action="/submit" method="post">
                <select name="peer">${areaOptions}</select>
                <label><input type="radio" name="availability" value="yes"> Yes</label>
                <label><input type="radio" name="availability" value="no"> No</label>
                <button type="submit">Submit</button>
            </form>
            <br>
            <a href="/history"><button type="button">View History</button></a>
            <br><br>
            <a href="/admin"><button type="button">Admin</button></a>
        </body>
        </html>
    `);
});

app.post('/submit', (req, res) => {
    const { peer, availability } = req.body;
    db.run('INSERT INTO history (peer, availability) VALUES (?, ?)', [peer, availability === 'yes']);
    writeDataToFile();
    res.redirect('/');
});

app.get('/history', (req, res) => {
    db.all('SELECT * FROM history WHERE date >= datetime("now", "-1 month")', [], (err, rows) => {
        if (err) {
            throw err;
        }
        let historyTable = rows.map(row => `<tr><td>${row.date}</td><td>${row.peer}</td><td>${row.availability ? 'Yes' : 'No'}</td></tr>`).join('');
        res.send(`
            <html>
            <head>
                <title>Manager Tracker History</title>
            </head>
            <body>
                <table border="1">
                    <tr><th>Date</th><th>Peer</th><th>Availability</th></tr>
                    ${historyTable}
                </table>
                <a href="/">Go Back</a>
            </body>
            </html>
        `);
    });
});

app.get('/admin', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Admin</title>
        </head>
        <body>
            <h1>Admin Panel</h1>
            <a href="/delete_history"><button type="button">Delete History</button></a>
        </body>
        </html>
    `);
});

app.get('/delete_history', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Delete History</title>
        </head>
        <body>
            <h1>Delete All History</h1>
            <p>Are you sure you want to delete all history data?</p>
            <form action="/delete_history_confirm" method="post">
                <button type="submit">Yes, Delete</button>
            </form>
            <a href="/"><button type="button">Cancel</button></a>
        </body>
        </html>
    `);
});

app.post('/delete_history_confirm', (req, res) => {
    db.run('DELETE FROM history');
    writeDataToFile();
    res.redirect('/');
});

// Function to write data back to the GitHub CSV
async function writeDataToFile() {
    db.all('SELECT * FROM history', [], async (err, rows) => {
        if (err) {
            throw err;
        }

        const csvStream = csv.format({ headers: true });
        let csvContent = '';
        csvStream.on('data', chunk => {
            csvContent += chunk.toString();
        });
        rows.forEach(row => {
            csvStream.write(row);
        });
        csvStream.end();

        const githubToken = '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';
        const owner = 'DrMacConKey';
        const repo = 'M_Tracker_Node';
        const path = 'history.csv';

        // Get the current file's SHA
        const shaResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const shaData = await shaResponse.json();
        const fileSha = shaData.sha;

        // Push updated CSV to GitHub
        await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update history CSV',
                content: Buffer.from(csvContent).toString('base64'),
                sha: fileSha
            })
        });

        console.log('CSV file updated on GitHub.');
    });
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
