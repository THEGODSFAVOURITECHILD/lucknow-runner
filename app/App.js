import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View, Image } from 'react-native';

import { COLORS } from './src/constants/colors';
import useAuthStore from './src/store/authStore';

import WelcomeScreen from './src/screens/auth/WelcomeScreen';
import UsernameScreen from './src/screens/auth/UsernameScreen';
import MapScreen from './src/screens/MapScreen';
import RunScreen from './src/screens/RunScreen';

const PlaceholderScreen = ({ route }) => (
  <View
    style={{
      flex: 1,
      backgroundColor: COLORS.BG_PRIMARY,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <Text style={{ color: COLORS.NEON_GREEN, fontSize: 20, fontWeight: '700' }}>
      {route.name}
    </Text>
    <Text style={{ color: COLORS.TEXT_SECONDARY, marginTop: 8 }}>
      Coming soon
    </Text>
  </View>
);

const HomeScreen = PlaceholderScreen;
const LeaderboardScreen = PlaceholderScreen;
const ProfileScreen = PlaceholderScreen;

const TAB_ICONS = {
  Home: require('./assets/tab-icons/home.png'),
  Map: require('./assets/tab-icons/map.png'),
  Run: require('./assets/tab-icons/run.png'),
  Leaderboard: require('./assets/tab-icons/leaderboard.png'),
  Profile: require('./assets/tab-icons/profile.png'),
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.BG_CARD,
          borderTopColor: COLORS.BORDER,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.NEON_GREEN,
        tabBarInactiveTintColor: COLORS.GREY_500,
        tabBarLabelStyle: { fontSize: 10, marginTop: -2 },
        tabBarIcon: ({ focused }) => (
  <Image
    source={TAB_ICONS[route.name]}
    style={{
      width: focused ? 30 : 26,
      height: focused ? 30 : 26,
      opacity: focused ? 1 : 0.45,
      resizeMode: 'contain',
    }}
  />
),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Run" component={RunScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { isLoggedIn, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.BG_PRIMARY,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: COLORS.NEON_GREEN,
            fontSize: 28,
            fontWeight: '800',
            letterSpacing: 3,
          }}
        >
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
            primary: COLORS.NEON_GREEN,
            background: COLORS.BG_PRIMARY,
            card: COLORS.BG_CARD,
            text: COLORS.TEXT_PRIMARY,
            border: COLORS.BORDER,
            notification: COLORS.NEON_RED,
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isLoggedIn ? (
            <Stack.Screen name="Main" component={MainTabs} />
          ) : (
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="Username" component={UsernameScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}