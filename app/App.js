import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Text,
  View,
  Image,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { COLORS } from './src/constants/colors';
import useAuthStore from './src/store/authStore';

import WelcomeScreen from './src/screens/auth/WelcomeScreen';
import UsernameScreen from './src/screens/auth/UsernameScreen';
import MapScreen from './src/screens/MapScreen';
import RunScreen from './src/screens/RunScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PlaceholderScreen = ({ route }) => (
  <View style={styles.placeholderContainer}>
    <Text style={styles.placeholderTitle}>{route.name}</Text>
    <Text style={styles.placeholderSubtitle}>Coming soon</Text>
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

function GlassTabBar({ state, navigation }) {
  const translateX = useRef(new Animated.Value(0)).current;

  const BAR_MARGIN = 18;
  const BAR_WIDTH = SCREEN_WIDTH - BAR_MARGIN * 2;
  const TAB_WIDTH = BAR_WIDTH / state.routes.length;
  const INDICATOR_WIDTH = 58;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: state.index * TAB_WIDTH + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [state.index, TAB_WIDTH, translateX]);

  return (
    <View style={styles.tabWrapper}>
      <BlurView intensity={46} tint="dark" style={styles.glassBar}>
        <View style={styles.glassOverlay} />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeSlider,
            {
              width: INDICATOR_WIDTH,
              transform: [{ translateX }],
            },
          ]}
        />

        <View style={styles.tabContent}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={[
                  styles.tabButton,
                  {
                    width: TAB_WIDTH,
                  },
                ]}
              >
                <Image
                  source={TAB_ICONS[route.name]}
                  style={[
                    styles.tabIcon,
                    {
                      width: focused ? 40 : 33,
                      height: focused ? 40 : 33,
                      opacity: focused ? 1 : 0.52,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
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
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingLogo}>
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

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    backgroundColor: COLORS.BG_PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderTitle: {
    color: COLORS.NEON_GREEN,
    fontSize: 20,
    fontWeight: '700',
  },
  placeholderSubtitle: {
    color: COLORS.TEXT_SECONDARY,
    marginTop: 8,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.BG_PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogo: {
    color: COLORS.NEON_GREEN,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },

  tabWrapper: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 20,
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    shadowColor: '#00FF88',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  glassBar: {
    flex: 1,
    borderRadius: 33,
    overflow: 'hidden',
    borderWidth: 1.4,
    borderColor: 'rgba(0, 255, 136, 0.48)',
    backgroundColor: 'rgba(6, 12, 10, 0.58)',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 255, 136, 0.055)',
  },
  tabContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeSlider: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 255, 136, 0.18)',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 255, 136, 0.66)',
    shadowColor: '#00FF88',
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  tabButton: {
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    resizeMode: 'contain',
  },
});