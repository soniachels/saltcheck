import React from 'react';
import { Tabs } from 'expo-router';
import { Colors, Typography } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.pepperRed,
        tabBarInactiveTintColor: Colors.steelBlueGrey,
        tabBarStyle: {
          backgroundColor: Colors.charcoal,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: Typography.fontSize.xs,
          fontWeight: '600',
          letterSpacing: 0.5,
        },
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontSize: Typography.fontSize.xl,
          fontWeight: 'bold',
          letterSpacing: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'TODAY',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today" size={size} color={color} />
          ),
          headerTitle: 'TODAY',
        }}
      />
      <Tabs.Screen
        name="open-loops"
        options={{
          title: 'LOOPS',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
          headerTitle: 'OPEN LOOPS',
        }}
      />
      <Tabs.Screen
        name="pepper-checkin"
        options={{
          title: 'PEPPER',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame" size={size} color={color} />
          ),
          headerTitle: 'PEPPER CHECK-IN',
        }}
      />
      <Tabs.Screen
        name="money-floor"
        options={{
          title: 'MONEY',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash" size={size} color={color} />
          ),
          headerTitle: 'MONEY FLOOR',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'MORE',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu" size={size} color={color} />
          ),
          headerTitle: 'MORE',
        }}
      />
    </Tabs>
  );
}