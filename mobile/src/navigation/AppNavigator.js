// Root navigator — shows auth screens when logged out, tab bar when logged in.

import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer }                from '@react-navigation/native';
import { createNativeStackNavigator }         from '@react-navigation/native-stack';
import { createBottomTabNavigator }           from '@react-navigation/bottom-tabs';

import { useAuthStore }    from '../store/authStore';
import { usePendingCount } from '../hooks/usePendingCount';
import { COLORS }          from '../constants/theme';

import Onboarding       from '../screens/Onboarding';
import Auth             from '../screens/Auth';
import Dashboard        from '../screens/Dashboard';
import PendingReplies   from '../screens/PendingReplies';
import Summary          from '../screens/Summary';
import Messages         from '../screens/Messages';
import ReplyLog         from '../screens/ReplyLog';
import Settings         from '../screens/Settings';
import PlatformConnect  from '../screens/PlatformConnect';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Tab icon — emoji with optional badge ─────────────────────────────────────
function TabIcon({ emoji, badge }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      {badge > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -10,
          backgroundColor: COLORS.error, borderRadius: 9999,
          minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Authenticated tab navigator ──────────────────────────────────────────────
function MainTabs() {
  const pendingCount = usePendingCount();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  COLORS.card,
          borderTopColor:   COLORS.cardBorder,
          borderTopWidth:   1,
          paddingBottom:    8,
          paddingTop:       8,
          height:           64,
        },
        tabBarActiveTintColor:   COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle:        { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={Dashboard}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <TabIcon emoji="⊞" />,
        }}
      />
      <Tab.Screen
        name="PendingReplies"
        component={PendingReplies}
        options={{
          tabBarLabel: 'Pending',
          tabBarIcon: () => <TabIcon emoji="✎" badge={pendingCount} />,
        }}
      />
      <Tab.Screen
        name="Summary"
        component={Summary}
        options={{
          tabBarLabel: 'Summary',
          tabBarIcon: () => <TabIcon emoji="◎" />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={Messages}
        options={{
          tabBarLabel: 'Messages',
          tabBarIcon: () => <TabIcon emoji="✉" />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: () => <TabIcon emoji="⚙" />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  const token     = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {token ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="PlatformConnect"
              component={PlatformConnect}
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={Onboarding} />
            <Stack.Screen name="Auth"       component={Auth} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
