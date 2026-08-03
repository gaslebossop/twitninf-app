import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ApplePayScreen from '../screens/ApplePayScreen';
import TestScreen from '../screens/TestScreen';

export type CryptoStackParamList = {
  ApplePay: undefined;
  Test: undefined;
};

const Stack = createStackNavigator<CryptoStackParamList>();

const CryptoNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#FF6B35',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="ApplePay"
        component={ApplePayScreen}
        options={{
          title: 'Acheter des NINFI',
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
};

export default CryptoNavigator;
