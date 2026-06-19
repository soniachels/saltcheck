import React from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Colors, Typography } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { PepperFab } from '../../src/components/PepperFab';
import { FloatingNav } from '../../src/components/FloatingNav';

export default function TabLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        tabBar={() => null}
        screenOptions={{
          tabBarStyle: { display: 'none', height: 0 },
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: {
            fontSize: Typography.fontSize.xl,
            fontWeight: '900',
            letterSpacing: 1.5,
          },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'TODAY',
            tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="girl-math"
          options={{
            title: 'MATH',
            tabBarIcon: ({ color, size }) => <Ionicons name="calculator" size={size} color={color} />,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="body"
          options={{
            title: 'BODY',
            tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="receipts-tab"
          options={{
            title: 'RECEIPTS',
            tabBarIcon: ({ color, size }) => <Ionicons name="lock-closed" size={size} color={color} />,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'MORE',
            tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} />,
            headerShown: false,
          }}
        />
        {/* Hidden routes (no tab) */}
        <Tabs.Screen
          name="pepper-checkin"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen
          name="open-loops"
          options={{ href: null, headerShown: false }}
        />
        <Tabs.Screen
          name="money-floor"
          options={{ href: null, headerShown: false }}
        />
      </Tabs>
      <FloatingNav />
      <PepperFab />
    </View>
  );
}
