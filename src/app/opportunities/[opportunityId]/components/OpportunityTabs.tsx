// File: src/app/opportunities/[opportunityId]/components/OpportunityTabs.tsx

import React from 'react';
import { 
  Tabs, 
  TabList, 
  TabPanels, 
  Tab, 
  TabPanel,
  Box,
  useColorModeValue
} from '@chakra-ui/react';
import { FileText, Info, Settings } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const TAB_ITEMS: TabItem[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'generalInformation', label: 'General Information', icon: Settings } 
];

interface OpportunityTabsProps {
  children: React.ReactNode[];
  defaultTab?: string;
}

export default function OpportunityTabs({ children, defaultTab = 'overview' }: OpportunityTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab;
  
  const tabIndex = TAB_ITEMS.findIndex(tab => tab.id === activeTab);
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const handleTabChange = (index: number) => {
    if (index >= 0 && index < TAB_ITEMS.length) {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set('tab', TAB_ITEMS[index].id);
      router.push(`?${newParams.toString()}`, { scroll: false });
    }
  };

  return (
    <Box 
      bg={bgColor} 
      borderRadius="lg" 
      shadow="sm" 
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Tabs 
        index={tabIndex !== -1 ? tabIndex : 0} 
        onChange={handleTabChange}
        isLazy
        lazyBehavior="keepMounted"
      >
        <TabList px={4} borderBottomColor={borderColor}>
          {TAB_ITEMS.map(tab => (
            <Tab 
              key={tab.id}
              py={4}
              display="flex"
              alignItems="center"
              gap={2}
              _selected={{
                color: 'blue.500',
                borderColor: 'blue.500'
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          {React.Children.map(children, (child, index) => {
            // Ensure we have a valid tab item for this index
            const tabItem = TAB_ITEMS[index];
            if (!tabItem) return null;

            return (
              <TabPanel key={tabItem.id} px={6} py={4}>
                {child}
              </TabPanel>
            );
          })}
        </TabPanels>
      </Tabs>
    </Box>
  );
}