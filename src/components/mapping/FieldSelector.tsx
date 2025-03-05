// File: src/components/mapping/FieldSelector.tsx
import React from 'react';
import Select, { components, OptionProps, SingleValueProps } from 'react-select';
import { useColorMode, Box, Text } from '@chakra-ui/react';

interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

interface FieldSelectorProps {
  options: FieldOption[];
  value?: string | null;
  onChange: (selected: FieldOption | null) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

const FieldSelector: React.FC<FieldSelectorProps> = ({
  options,
  value,
  onChange,
  placeholder = "Search and select a field...",
  isDisabled = false
}) => {
  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  // Find the selected option
  const selectedOption = options.find(opt => opt.value === value);

  // Chakra UI theme-aware styles
  const customStyles = {
    control: (base: any) => ({
      ...base,
      background: isDark ? 'gray.700' : 'white',
      borderColor: isDark ? 'gray.600' : 'gray.200',
      borderRadius: 'md',
      '&:hover': {
        borderColor: isDark ? 'blue.400' : 'blue.500',
      },
    }),
    menu: (base: any) => ({
      ...base,
      background: isDark ? 'gray.700' : 'white',
      borderColor: isDark ? 'gray.600' : 'gray.200',
      boxShadow: 'lg',
    }),
    option: (base: any, state: any) => ({
      ...base,
      background: state.isFocused
        ? isDark ? 'blue.600' : 'blue.50'
        : state.isSelected
        ? isDark ? 'blue.700' : 'blue.100'
        : 'transparent',
      color: isDark ? 'white' : 'black',
      cursor: 'pointer',
      '&:active': {
        background: isDark ? 'blue.700' : 'blue.100',
      },
    }),
  };

  return (
    <Select<FieldOption>
      options={options}
      value={selectedOption || null}
      onChange={onChange}
      placeholder={placeholder}
      isDisabled={isDisabled}
      isClearable
      isSearchable
      styles={customStyles}
      // Additional props for better UX
      menuPortalTarget={document.body}
      maxMenuHeight={250}
      menuPlacement="auto"
      // Improved filtering
      filterOption={(option, input) => {
        if (!input) return true;
        const searchValue = input.toLowerCase();
        const optionValue = option.data.label.toLowerCase();
        const description = option.data.description?.toLowerCase() || '';
        
        return (
          optionValue.includes(searchValue) ||
          description.includes(searchValue)
        );
      }}
    />
  );
};

export default FieldSelector;