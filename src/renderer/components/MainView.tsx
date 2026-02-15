import React, { useEffect, useState } from 'react';
import { Box, Tabs, Tab, useMediaQuery, useTheme } from '@mui/material';
import {
  Dns as ServersIcon,
  Route as RoutingIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import ConnectionBar from './ConnectionBar';
import ServerManager from './ServerManager';
import AppRouting from './AppRouting';
import Settings from './Settings';

const TAB_KEYS = ['servers', 'routing', 'settings'] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_LABELS = ['Servers', 'Routing', 'Settings'] as const;
const TAB_ICONS = [ServersIcon, RoutingIcon, SettingsIcon] as const;

const getTabFromHash = (): number => {
  const hash = window.location.hash.replace(/^#/, '').toLowerCase() as TabKey;
  const idx = TAB_KEYS.indexOf(hash);
  return idx >= 0 ? idx : 0;
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 0 }}>{children}</Box>}
    </div>
  );
}

export default function MainView() {
  const [value, setValue] = useState(getTabFromHash);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const onHashChange = () => {
      const next = getTabFromHash();
      setValue(prev => (prev === next ? prev : next));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
    const tabKey = TAB_KEYS[newValue];
    window.history.replaceState(null, '', `#${tabKey}`);
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'linear-gradient(to bottom, rgba(11, 17, 23, 0.94), rgba(11, 17, 23, 0.78))',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.12)',
          pb: 1,
        }}
      >
        <ConnectionBar />
        <Box sx={{ px: { xs: 1, sm: 2 }, pt: 1 }}>
          <Tabs
            value={value}
            onChange={handleChange}
            aria-label="main navigation"
            variant={isMobile ? 'scrollable' : 'fullWidth'}
            scrollButtons={isMobile ? 'auto' : false}
            allowScrollButtonsMobile
            sx={{
              backgroundColor: 'rgba(16, 25, 35, 0.78)',
              border: '1px solid var(--border-light)',
              borderRadius: 3,
              minHeight: 58,
              p: 0.5,
              boxShadow: 'inset 0 1px 0 rgba(148, 163, 184, 0.1)',
              '& .MuiTabs-scrollButtons': {
                color: 'var(--text-secondary)',
              },
              '& .MuiTab-root': {
                color: 'var(--text-secondary)',
                minHeight: 48,
                borderRadius: 2,
                minWidth: isMobile ? 120 : 'auto',
                px: { xs: 1.25, sm: 2.5 },
                transition: 'all 0.2s ease',
                '&.Mui-selected': { color: 'var(--text-primary)' },
                '& .MuiSvgIcon-root': {
                  fontSize: 18,
                },
              },
              '& .MuiTabs-indicator': {
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(90deg, rgba(20, 184, 166, 0.2), rgba(56, 189, 248, 0.2))',
                zIndex: 0,
              },
              '& .MuiTabs-flexContainer': { gap: 0.5 },
            }}
          >
            {TAB_LABELS.map((label, index) => {
              const Icon = TAB_ICONS[index];
              return (
                <Tab
                  key={label}
                  icon={<Icon />}
                  iconPosition="start"
                  label={label}
                  id={`tab-${index}`}
                  aria-controls={`tabpanel-${index}`}
                />
              );
            })}
          </Tabs>
        </Box>
      </Box>

      <Box sx={{ px: { xs: 0.5, sm: 1 }, pb: 2 }}>
        <TabPanel value={value} index={0}>
          <ServerManager />
        </TabPanel>
        <TabPanel value={value} index={1}>
          <AppRouting />
        </TabPanel>
        <TabPanel value={value} index={2}>
          <Settings />
        </TabPanel>
      </Box>
    </Box>
  );
}
