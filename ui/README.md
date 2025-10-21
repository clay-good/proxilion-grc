# Proxilion Web UI Dashboard

Modern, real-time web dashboard for monitoring and managing Proxilion - Enterprise AI Security Network Proxy.

## Features

### 📊 Real-Time Monitoring
- **Live Metrics**: Request volume, threats blocked, costs, and latency
- **Auto-Refresh**: Updates every 5 seconds for real-time insights
- **Historical Charts**: Request volume and security threat trends
- **Provider Status**: Monitor health and performance of AI providers

### 🔒 Security Dashboard
- **Threat Detection**: Real-time security threat visualization
- **Alert Management**: View and acknowledge security alerts
- **PII Findings**: Track personally identifiable information detections
- **Injection Attempts**: Monitor prompt injection and jailbreak attempts

### 💰 Cost Analytics
- **Total Spend**: Track cumulative AI API costs
- **Cost Per Request**: Average cost analysis
- **Top Models**: See which models are most expensive
- **Budget Monitoring**: Keep costs under control

### ⚡ Performance Metrics
- **Latency Tracking**: Average, P95, and P99 latency
- **Cache Hit Rate**: Monitor caching effectiveness
- **Error Rates**: Track system and provider errors
- **Success Rates**: Overall request success metrics

## Quick Start

### Prerequisites
- Node.js 18+ or Bun
- pnpm (recommended) or npm
- Proxilion backend running

### Installation

```bash
cd ui
pnpm install
```

### Development

```bash
# Start development server
pnpm dev

# Open browser to http://localhost:3000
```

### Build for Production

```bash
# Build static files
pnpm build

# Files will be exported to ../public directory
# Proxilion backend will serve them automatically
```

### Environment Variables

Create `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8787/api
```

## Architecture

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **UI Library**: React 18
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Data Fetching**: TanStack Query (React Query)
- **Type Safety**: TypeScript

### Project Structure

```
ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Dashboard page
│   │   ├── providers.tsx       # React Query provider
│   │   └── globals.css         # Global styles
│   └── components/
│       ├── MetricsCard.tsx     # Metric display card
│       ├── RequestsChart.tsx   # Request volume chart
│       ├── SecurityChart.tsx   # Security threats chart
│       ├── AlertsList.tsx      # Alerts list component
│       └── ProvidersStatus.tsx # Provider status component
├── public/                     # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## API Integration

The dashboard connects to Proxilion's REST API:

### Endpoints Used

```typescript
GET /api/metrics/current        // Current metrics snapshot
GET /api/metrics/history        // Historical metrics
GET /api/metrics/timeseries     // Time series data
GET /api/alerts                 // Active alerts
GET /api/system/status          // System status
POST /api/alerts/:id/acknowledge // Acknowledge alert
```

### Data Refresh Intervals

- **Metrics**: 5 seconds
- **Alerts**: 10 seconds
- **System Status**: 30 seconds
- **Charts**: 10 seconds

## Components

### MetricsCard

Displays a single metric with icon and trend.

```tsx
<MetricsCard
  title="Total Requests"
  value={1234}
  change="50/s"
  icon={Activity}
  color="blue"
/>
```

### RequestsChart

Line chart showing request volume over time.

```tsx
<RequestsChart />
```

### SecurityChart

Bar chart showing security threat categories.

```tsx
<SecurityChart />
```

### AlertsList

List of recent security alerts with severity indicators.

```tsx
<AlertsList alerts={alerts} loading={false} />
```

### ProvidersStatus

Status cards for each AI provider showing health metrics.

```tsx
<ProvidersStatus providers={providersData} />
```

## Customization

### Colors

Edit `tailwind.config.js` to customize the color scheme:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        // Your custom colors
      },
    },
  },
},
```

### Refresh Intervals

Edit `src/app/providers.tsx` to change default refresh intervals:

```typescript
defaultOptions: {
  queries: {
    staleTime: 5000,        // Change this
    refetchInterval: 5000,  // And this
  },
},
```

## Deployment

### Static Export

The dashboard is built as a static export that can be served by any web server:

```bash
pnpm build
# Files exported to ../public/
```

### Serve with Proxilion

Proxilion automatically serves the UI from the `/public` directory:

```bash
# From project root
npm start

# Dashboard available at http://localhost:8787/
```

### Deploy Separately

You can also deploy the UI separately to Vercel, Netlify, or any static hosting:

```bash
# Build
pnpm build

# Deploy the ../public directory
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- **Initial Load**: < 1s (gzipped)
- **Bundle Size**: ~200KB (gzipped)
- **Lighthouse Score**: 95+
- **Real-Time Updates**: WebSocket-ready (future)

## Troubleshooting

### Dashboard not loading

1. Check Proxilion backend is running
2. Verify API URL in `.env.local`
3. Check browser console for errors

### No data showing

1. Ensure Proxilion is processing requests
2. Check API endpoints are accessible
3. Verify CORS settings

### Charts not updating

1. Check network tab for failed requests
2. Verify refresh intervals in React Query
3. Check browser console for errors

## Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Policy management UI
- [ ] User management interface
- [ ] Advanced filtering and search
- [ ] Custom dashboard layouts
- [ ] Dark mode support
- [ ] Mobile app (React Native)
- [ ] Export reports (PDF, CSV)

## Contributing

Contributions are welcome! Please read the main CONTRIBUTING.md file.

## License

MIT License - see LICENSE file for details

---

**Built with ❤️ for the Proxilion community**

