// Old route — loops now live inline on the Today screen
import { Redirect } from 'expo-router';

export default function OpenLoopsRedirect() {
  return <Redirect href="/(tabs)" />;
}
