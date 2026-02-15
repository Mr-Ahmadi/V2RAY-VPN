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
      main: '#14b8a6',
    },
    secondary: {
      main: '#38bdf8',
    },
    background: {
      default: '#0b1117',
      paper: '#101923',
    },
    text: {
      primary: '#e6edf3',
      secondary: '#9aa7b2',
    },
  },
  typography: {
    fontFamily: '"Sora", "Segoe UI", sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(56, 189, 248, 0.12)',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
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
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
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
