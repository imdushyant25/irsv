import React, { useState, useEffect } from 'react';
import {
  VStack,
  Box,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Select,
  Checkbox,
  Stack,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Switch,
  Radio,
  RadioGroup,
  Button,
  useToast,
  Text,
  Divider,
} from '@chakra-ui/react';

interface ParametersFormProps {
  opportunityId: string;
  onSave: (parameters: any) => Promise<void>;
  initialParameters?: any;
}

interface DawPenalties {
  brandMedicallyNecessary: boolean;
  memberRequestsBrand: boolean;
}

interface RebateDetail {
  type: 'detailed' | 'lumpSum';
  retailBrand30?: string;
  retailBrand90?: string;
  mailBrand?: string;
  specialtyBrand?: string;
  lumpSum?: string;
}

interface RebateConfig {
  incumbent: RebateDetail;
  fourthPbm: {
    useContractTerms: boolean;
    type: 'detailed' | 'lumpSum' | 'contractTerms';
  } & RebateDetail;
}

export default function ParametersForm({ opportunityId, onSave, initialParameters }: ParametersFormProps) {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [parameters, setParameters] = useState({
    formulary: '',
    planExclusions: {
      lcvWowExclusions: true,
      medicalBenefitsExclusions: false,
      desiDrugs: false,
      otcDrugs: false,
      compoundedMedications: false,
      abortifacients: false,
      glp1Weightloss: false,
      weightlossNonGlp1: false,
      fertility: false,
      growthHormone: false,
      questionableClinicalEffectiveness: false
    },
    dawPenalties: {
      brandMedicallyNecessary: false,
      memberRequestsBrand: false
    },
    rebates: {
      incumbent: {
        type: 'detailed',
        retailBrand30: '',
        retailBrand90: '',
        mailBrand: '',
        specialtyBrand: '',
        lumpSum: ''
      },
      fourthPbm: {
        useContractTerms: false,
        type: 'detailed',
        retailBrand30: '',
        retailBrand90: '',
        mailBrand: '',
        specialtyBrand: '',
        lumpSum: ''
      }
    },
    dispensingFee: '',
    flags: {
      mcap: false,
      pap: false,
      ids: false,
      hans: false
    },
    adminFees: {
      perClaim: '',
      illuminateRx: ''
    },
    cotRate: ''
  });

  useEffect(() => {
    if (initialParameters) {
      setParameters(initialParameters);
    }
  }, [initialParameters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onSave(parameters);
      toast({
        title: 'Parameters saved',
        description: 'File parameters have been successfully updated',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error saving parameters',
        description: error instanceof Error ? error.message : 'An error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={6} align="stretch">
        {/* Formulary Selection */}
        <Card>
          <CardHeader>
            <Heading size="md">Formulary Selection</Heading>
          </CardHeader>
          <CardBody>
            <FormControl>
              <FormLabel>Select Formulary</FormLabel>
              <Select
                value={parameters.formulary}
                onChange={(e) => setParameters({
                  ...parameters,
                  formulary: e.target.value
                })}
              >
                <option value="">Select an option</option>
                <option value="4th PBM Closed Formulary">4th PBM Closed Formulary</option>
                <option value="4th PBM Open Formulary">4th PBM Open Formulary</option>
              </Select>
            </FormControl>
          </CardBody>
        </Card>

        {/* Plan Exclusions */}
        <Card>
          <CardHeader>
            <Heading size="md">Plan Exclusions</Heading>
          </CardHeader>
          <CardBody>
            <Stack spacing={3}>
              {Object.entries(parameters.planExclusions).map(([key, value]) => (
                <Checkbox
                  key={key}
                  isChecked={value as boolean}
                  onChange={(e) => setParameters({
                    ...parameters,
                    planExclusions: {
                      ...parameters.planExclusions,
                      [key]: e.target.checked
                    }
                  })}
                  isDisabled={key === 'lcvWowExclusions'}
                >
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </Checkbox>
              ))}
            </Stack>
          </CardBody>
        </Card>

        {/* DAW Penalties */}
        <Card>
          <CardHeader>
            <Heading size="md">DAW Penalties</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={3}>
              <Checkbox
                isChecked={parameters.dawPenalties.brandMedicallyNecessary}
                onChange={(e) => setParameters({
                  ...parameters,
                  dawPenalties: {
                    ...parameters.dawPenalties,
                    brandMedicallyNecessary: e.target.checked
                  }
                })}
              >
                Brand Medically Necessary (DAW 1)
              </Checkbox>
              
              <Checkbox
                isChecked={parameters.dawPenalties.memberRequestsBrand}
                onChange={(e) => setParameters({
                  ...parameters,
                  dawPenalties: {
                    ...parameters.dawPenalties,
                    memberRequestsBrand: e.target.checked
                  }
                })}
              >
                Member Requests Brand (DAW 2)
              </Checkbox>
            </VStack>
          </CardBody>
        </Card>
        {/* Rebate Configuration */}
        <Card>
          <CardHeader>
            <Heading size="md">Rebate Configuration</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={6} align="stretch">
              {/* Incumbent Rebates */}
              <Box>
                <Heading size="sm" mb={4}>Incumbent Rebates</Heading>
                <RadioGroup
                  value={parameters.rebates.incumbent.type}
                  onChange={(value) => setParameters({
                    ...parameters,
                    rebates: {
                      ...parameters.rebates,
                      incumbent: {
                        ...parameters.rebates.incumbent,
                        type: value
                      }
                    }
                  })}
                >
                  <Stack spacing={4}>
                    <Radio value="detailed">Detailed Breakdown</Radio>
                    {parameters.rebates.incumbent.type === 'detailed' && (
                      <VStack spacing={3} pl={6}>
                        <FormControl>
                          <FormLabel>Retail Brand (30)</FormLabel>
                          <NumberInput
                            value={parameters.rebates.incumbent.retailBrand30}
                            defaultValue={parameters.dispensingFee}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  incumbent: {
                                    ...parameters.rebates.incumbent,
                                    retailBrand30: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                        <FormControl>
                          <FormLabel>Retail Brand (90)</FormLabel>
                          <NumberInput
                            value={parameters.rebates.incumbent.retailBrand90}
                            defaultValue={parameters.rebates.incumbent.retailBrand90}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  incumbent: {
                                    ...parameters.rebates.incumbent,
                                    retailBrand90: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                        <FormControl>
                          <FormLabel>Mail Brand</FormLabel>
                          <NumberInput
                            value={parameters.rebates.incumbent.mailBrand}
                            defaultValue={parameters.rebates.incumbent.mailBrand}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  incumbent: {
                                    ...parameters.rebates.incumbent,
                                    mailBrand: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                        <FormControl>
                          <FormLabel>Specialty Brand</FormLabel>
                          <NumberInput
                            value={parameters.rebates.incumbent.specialtyBrand || ''}
                            defaultValue={parameters.rebates.incumbent.specialtyBrand} 
                            precision={2}
                            >    
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  incumbent: {
                                    ...parameters.rebates.incumbent,
                                    specialtyBrand: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                      </VStack>
                    )}
                    <Radio value="lumpSum">Lump Sum</Radio>
                    {parameters.rebates.incumbent.type === 'lumpSum' && (
                      <FormControl pl={6}>
                        <FormLabel>Lump Sum Amount</FormLabel>
                        <NumberInput
                            value={parameters.rebates.incumbent.lumpSum}
                            defaultValue={parameters.rebates.incumbent.lumpSum}
                            precision={2}
                            >
                            <NumberInputField
                            onChange={(e) => setParameters({
                              ...parameters,
                              rebates: {
                                ...parameters.rebates,
                                incumbent: {
                                  ...parameters.rebates.incumbent,
                                  lumpSum: e.target.value
                                }
                              }
                            })}
                          />
                        </NumberInput>
                      </FormControl>
                    )}
                  </Stack>
                </RadioGroup>
              </Box>

              <Divider />

              {/* Fourth PBM Rebates */}
              {/* Fourth PBM Rebates */}
              <Box>
                <Heading size="sm" mb={4}>4th PBM Rebates</Heading>
                <RadioGroup
                  value={parameters.rebates.fourthPbm.type}
                  onChange={(value) => {
                    // Reset all fields first
                    const resetFourthPbm = {
                      ...parameters.rebates.fourthPbm,
                      useContractTerms: false,
                      lumpSum: '',
                      retailBrand30: '',
                      retailBrand90: '',
                      mailBrand: '',
                      specialtyBrand: ''
                    };

                    // Set specific option
                    if (value === 'contractTerms') {
                      resetFourthPbm.useContractTerms = true;
                    }

                    setParameters({
                      ...parameters,
                      rebates: {
                        ...parameters.rebates,
                        fourthPbm: {
                          ...resetFourthPbm,
                          type: value
                        }
                      }
                    });
                  }}
                >
                  <Stack spacing={4}>
                    <Radio value="contractTerms">Use Contract Terms</Radio>
                    
                    <Radio value="lumpSum">Lump Sum</Radio>
                    {parameters.rebates.fourthPbm.type === 'lumpSum' && (
                      <FormControl pl={6}>
                        <FormLabel>Lump Sum Amount</FormLabel>
                        <NumberInput
                          value={parameters.rebates.fourthPbm.lumpSum}
                          defaultValue={parameters.rebates.fourthPbm.lumpSum}
                          precision={2}
                          >    
                          <NumberInputField
                            onChange={(e) => setParameters({
                              ...parameters,
                              rebates: {
                                ...parameters.rebates,
                                fourthPbm: {
                                  ...parameters.rebates.fourthPbm,
                                  lumpSum: e.target.value
                                }
                              }
                            })}
                          />
                        </NumberInput>
                      </FormControl>
                    )}

                    <Radio value="detailed">Detailed Breakdown</Radio>
                    {parameters.rebates.fourthPbm.type === 'detailed' && (
                      <VStack spacing={3} pl={6}>
                        <FormControl isRequired>
                          <FormLabel>Retail Brand (30)</FormLabel>
                          <NumberInput
                            value={parameters.rebates.fourthPbm.retailBrand30}
                            defaultValue={parameters.rebates.fourthPbm.retailBrand30}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  fourthPbm: {
                                    ...parameters.rebates.fourthPbm,
                                    retailBrand30: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                        
                        <FormControl isRequired>
                          <FormLabel>Retail Brand (90)</FormLabel>
                          <NumberInput
                            value={parameters.rebates.fourthPbm.retailBrand90}
                            defaultValue={parameters.rebates.fourthPbm.retailBrand90}
                            precision={2}    
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  fourthPbm: {
                                    ...parameters.rebates.fourthPbm,
                                    retailBrand90: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>

                        <FormControl isRequired>
                          <FormLabel>Mail Brand</FormLabel>
                          <NumberInput
                            value={parameters.rebates.fourthPbm.mailBrand}
                            defaultValue={parameters.rebates.fourthPbm.mailBrand}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  fourthPbm: {
                                    ...parameters.rebates.fourthPbm,
                                    mailBrand: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>

                        <FormControl isRequired>
                          <FormLabel>Specialty Brand</FormLabel>
                          <NumberInput
                            value={parameters.rebates.fourthPbm.specialtyBrand}
                            defaultValue={parameters.rebates.fourthPbm.specialtyBrand}
                            precision={2}
                            >  
                            <NumberInputField
                              onChange={(e) => setParameters({
                                ...parameters,
                                rebates: {
                                  ...parameters.rebates,
                                  fourthPbm: {
                                    ...parameters.rebates.fourthPbm,
                                    specialtyBrand: e.target.value
                                  }
                                }
                              })}
                            />
                          </NumberInput>
                        </FormControl>
                      </VStack>
                    )}
                  </Stack>
                </RadioGroup>
              </Box>
            </VStack>
          </CardBody>
        </Card>
        {/* Additional Parameters */}
        <Card>
          <CardHeader>
            <Heading size="md">Additional Parameters</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {/* Dispensing Fee */}
              <FormControl>
              <FormLabel>Dispensing Fee</FormLabel>
              <NumberInput
                value={parameters.dispensingFee || ''}
                defaultValue={parameters.dispensingFee}
                precision={2}
              >
                <NumberInputField
                  onChange={(e) => setParameters({
                    ...parameters,
                    dispensingFee: e.target.value
                  })}
                />
              </NumberInput>
            </FormControl>

              {/* Flags */}
              <FormControl>
                <FormLabel>Feature Flags</FormLabel>
                <Stack spacing={3}>
                  {Object.entries(parameters.flags).map(([key, value]) => (
                    <Switch
                      key={key}
                      isChecked={value as boolean}
                      onChange={(e) => setParameters({
                        ...parameters,
                        flags: {
                          ...parameters.flags,
                          [key]: e.target.checked
                        }
                      })}
                    >
                      {key.toUpperCase()}
                    </Switch>
                  ))}
                </Stack>
              </FormControl>

              {/* Admin Fees */}
              <FormControl>
                <FormLabel>Admin Fees</FormLabel>
                <VStack spacing={3}>
                  <FormControl>
                    <FormLabel>Per Claim Admin Fee</FormLabel>
                    <NumberInput
                      value={parameters.adminFees.perClaim || ''}
                      defaultValue={parameters.adminFees.perClaim}
                      precision={2}
                    >
                      <NumberInputField
                        onChange={(e) => setParameters({
                          ...parameters,
                          adminFees: {
                            ...parameters.adminFees,
                            perClaim: e.target.value
                          }
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                  
                  <FormControl>
                    <FormLabel>IlluminateRx Admin Fee</FormLabel>
                    <NumberInput
                      value={parameters.adminFees.illuminateRx || ''}
                      defaultValue={parameters.adminFees.illuminateRx}
                      precision={2}
                    >
                      <NumberInputField
                        onChange={(e) => setParameters({
                          ...parameters,
                          adminFees: {
                            ...parameters.adminFees,
                            illuminateRx: e.target.value
                          }
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                </VStack>
              </FormControl>
              {/* COT Rate */}
              <FormControl>
                <FormLabel>Continuation of Therapy (COT) Rate</FormLabel>
                <NumberInput
                  value={parameters.cotRate || ''} // Add fallback for null/undefined
                  defaultValue={parameters.cotRate} // Add default value from API
                  precision={2} // Since your API shows 1.3, let's handle decimals
                >
                  <NumberInputField
                    onChange={(e) => setParameters({
                      ...parameters,
                      cotRate: e.target.value
                    })}
                  />
                </NumberInput>
              </FormControl>
            </VStack>
          </CardBody>
        </Card>

        {/* Form Submit Button */}
        <Button
          type="submit"
          colorScheme="blue"
          isLoading={isLoading}
          loadingText="Saving..."
        >
          Save Parameters
        </Button>
      </VStack>
    </form>
  );
}