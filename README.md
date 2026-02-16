Quiet Scores - Live ESPN Data (React)

A modern, responsive React application that displays **real-time live sports scores** from ESPN's official APIs in a clean and organized layout.

Features

- **Real Live Scores**: Live data from ESPN APIs for NFL, NBA, MLB, NHL, College Football, and College Basketball
- **Live Score Display**: Shows current game scores with live indicators and real-time updates
- **Sport Filtering**: Filter games by specific leagues and sports
- **Date Navigation**: Navigate through weeks and days to view past and future games
- **Betting Odds**: View spreads, over/under, and moneylines for scheduled games
- **Game Summaries**: Click any game to view detailed box scores, top performers, and scoring plays
- **MLB Live Features**: Bases visualization, count (balls/strikes/outs), and inning display for live baseball games
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Auto-refresh**: Automatically updates scores every 5 seconds for live games, 60 seconds otherwise
- **Modern UI**: Beautiful dark theme with clean card-based layout

Tech Stack

- **React 19** - Modern React with hooks
- **Vite** - Fast build tool and dev server
- **ESPN APIs** - Real-time sports data
- **Vercel** - Hosting and deployment

Local Development

1. **Install dependencies**:
   ```bash
   cd quiet-scores-react
   npm install
   ```

2. **Run development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

Deployment

This project is configured for Vercel deployment. The `vercel.json` file in the root directory configures Vercel to build from the `quiet-scores-react` subdirectory.

Features in Detail

### Live Game Features
- **Possession Indicators**: Blue border accent shows which team has possession (football) or is at bat (baseball)
- **Winner Highlighting**: Green background for winning teams in final games
- **Live Updates**: Scores refresh automatically every 5 seconds when games are live

### MLB Specific
- **Bases Visualization**: Baseball diamond showing occupied bases
- **Count Display**: Visual indicators for balls, strikes, and outs
- **Inning Display**: Shows current inning (Top/Bottom Xth)

### Game Summaries
- **Box Scores**: Team statistics in organized tables
- **Top Performers**: Player leaders by category (passing yards, points, goals, etc.)
- **Scoring Plays**: Chronological list of all scoring plays
- **Game Notes**: Real-time commentary and updates
- **Related News**: Links to ESPN articles

### Betting Information
- **Spreads**: Point spreads displayed next to team names
- **Over/Under**: Total points/goals displayed between teams
- **Moneylines**: Moneyline odds for each team

ESPN APIs Used

- NFL Scoreboard
- NBA Scoreboard
- MLB Scoreboard
- NHL Scoreboard
- College Football Scoreboard
- College Basketball Scoreboard
- Game Summary API (for detailed game information)

## 🔧 Project Structure

```
quiet-scores-react/
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   ├── styles.css       # Application styles
│   ├── hooks/
│   │   └── useScores.js # Custom hook for fetching scores
│   └── lib/
│       └── espnApi.js   # ESPN API integration
├── public/              # Static assets
├── vercel.json         # Vercel configuration
└── package.json        # Dependencies
```
