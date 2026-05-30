import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

import { COLORS } from './src/constants/colors';
import useAuthStore from './src/store/authStore';

// ─── Screens ──────────────────────────────────────────────────────────────────
import WelcomeScreen  from './src/screens/auth/WelcomeScreen';
import UsernameScreen from './src/screens/auth/UsernameScreen';

// These are placeholder screens — you will build them one by one
// For now they just show the screen name so navigation works immediately
const PlaceholderScreen = ({ route }) => (
  <View style={{ flex:1, backgroundColor: COLORS.BG_PRIMARY,
                 justifyContent:'center', alignItems:'center' }}>
    <Text style={{ color: COLORS.NEON_GREEN, fontSize: 20, fontWeight:'700' }}>
      {route.name}
    </Text>
    <Text style={{ color: COLORS.TEXT_SECONDARY, marginTop: 8 }}>
      Coming soon
    </Text>
  </View>
);

const HomeScreen        = PlaceholderScreen;
const MapScreen         = PlaceholderScreen;
const RunScreen         = PlaceholderScreen;
const LeaderboardScreen = PlaceholderScreen;
const ProfileScreen     = PlaceholderScreen;

// ─── Tab Icons (simple text for now, swap for icons later) ───────────────────
const TAB_ICONS = {
  Home:        '🏠',
  Map:         '🗺',
  Run:         '🏃',
  Leaderboard: '🏆',
  Profile:     '👤',
};

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Main tabs (shown after login) ───────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.BG_CARD,
          borderTopColor:  COLORS.BORDER,
          borderTopWidth:  0.5,
          height:          60,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:   COLORS.NEON_GREEN,
        tabBarInactiveTintColor: COLORS.GREY_500,
        tabBarLabelStyle: { fontSize: 10, marginTop: -2 },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Home"        component={HomeScreen}        />
      <Tab.Screen name="Map"         component={MapScreen}         />
      <Tab.Screen name="Run"         component={RunScreen}         />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile"     component={ProfileScreen}     />
    </Tab.Navigator>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { isLoggedIn, isLoading, initialize } = useAuthStore();

  // Check saved token on every app launch
  useEffect(() => {
    initialize();
  }, []);

  // Show nothing while checking stored login state
  if (isLoading) {
    return (
      <View style={{ flex:1, backgroundColor: COLORS.BG_PRIMARY,
                     justifyContent:'center', alignItems:'center' }}>
        <Text style={{ color: COLORS.NEON_GREEN, fontSize: 28, fontWeight:'800',
                       letterSpacing: 3 }}>
          SEKTOR<Text style={{ color: COLORS.TEXT_PRIMARY }}>RUN</Text>
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.BG_PRIMARY} />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary:    COLORS.NEON_GREEN,
            background: COLORS.BG_PRIMARY,
            card:       COLORS.BG_CARD,
            text:       COLORS.TEXT_PRIMARY,
            border:     COLORS.BORDER,
            notification: COLORS.NEON_RED,
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isLoggedIn ? (
            <Stack.Screen name="Main" component={MainTabs} />
          ) : (
            <>
              <Stack.Screen name="Welcome"  component={WelcomeScreen}  />
              <Stack.Screen name="Username" component={UsernameScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
