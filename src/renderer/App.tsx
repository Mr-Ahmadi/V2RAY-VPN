import React, { useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Typography } from '@mui/material';
import Navbar from './components/Navbar';
import MainView from './components/MainView';
import './App.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#818cf8',
    },
    secondary: {
      main: '#f472b6',
    },
    background: {
      default: '#020617',
      paper: '#0f172a',
    },
  },
  typography: {
    fontFamily: '"Outfit", "Inter", sans-serif',
  },
});

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, textAlign: 'center', color: 'white' }}>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Something went wrong
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            {this.state.error?.message}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#64748b' }}>
            Check the console for more details
          </Typography>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    console.log('App mounted, checking for electronAPI...');
    console.log('window.electronAPI:', (window as any).electronAPI);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <Navbar />
          <MainView />
        </Box>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
