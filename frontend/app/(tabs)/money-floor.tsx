// Old route — redirect to the modernized Girl Math screen
import { Redirect } from 'expo-router';

export default function MoneyFloorRedirect() {
  return <Redirect href="/(tabs)/girl-math" />;
}
