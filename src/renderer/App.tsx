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
      light: '#2dd4bf',
      dark: '#0f766e',
    },
    secondary: {
      main: '#38bdf8',
    },
    background: {
      default: '#090f14',
      paper: '#101923',
    },
    text: {
      primary: '#e6edf3',
      secondary: '#94a3b8',
    },
    divider: 'rgba(56, 189, 248, 0.14)',
  },
  typography: {
    fontFamily: '"Inter Local", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h6: {
      fontWeight: 700,
      letterSpacing: 0.2,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: 0.15,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(56, 189, 248, 0.12)',
          boxShadow: '0 14px 34px rgba(2, 8, 23, 0.34)',
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
          boxShadow: 'none',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: '1px solid rgba(56, 189, 248, 0.14)',
          backgroundImage: 'none',
          backgroundColor: '#0f1822',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small',
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
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at 14% 6%, rgba(20, 184, 166, 0.14) 0%, transparent 42%), radial-gradient(circle at 88% 14%, rgba(56, 189, 248, 0.1) 0%, transparent 45%)',
              zIndex: 0,
            },
          }}
        >
          <Box sx={{ position: 'relative', zIndex: 1, display: 'contents' }}>
            <Navbar />
            <MainView />
          </Box>
        </Box>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
