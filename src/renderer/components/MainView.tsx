import React, { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import ConnectionBar from './ConnectionBar';
import ServerManager from './ServerManager';
import AppRouting from './AppRouting';
import Settings from './Settings';

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
  const [value, setValue] = useState(0);

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ConnectionBar />
      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="main navigation"
        sx={{
          backgroundColor: '#1e293b',
          borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
          minHeight: 48,
          '& .MuiTab-root': {
            color: '#94a3b8',
            minHeight: 48,
            '&.Mui-selected': { color: '#6366f1' },
          },
          '& .MuiTabs-indicator': { backgroundColor: '#6366f1' },
        }}
      >
        <Tab label="Servers" id="tab-0" aria-controls="tabpanel-0" />
        <Tab label="App Routing" id="tab-1" aria-controls="tabpanel-1" />
        <Tab label="Settings" id="tab-2" aria-controls="tabpanel-2" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
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
