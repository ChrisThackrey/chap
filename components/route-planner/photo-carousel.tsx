import { ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { VenuePhoto } from '@/types/route';
import { buildDisplayPhotoUrl } from '@/lib/google-places';

interface PhotoCarouselProps {
  photos: VenuePhoto[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_WIDTH = SCREEN_WIDTH - 80; // Account for modal padding
const PHOTO_HEIGHT = 200;

export function PhotoCarousel({ photos }: PhotoCarouselProps) {
  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      pagingEnabled
      decelerationRate="fast"
      snapToInterval={PHOTO_WIDTH + 12}
      contentContainerStyle={styles.container}
    >
      {photos.map((photo, index) => (
        <Image
          key={index}
          source={{ uri: buildDisplayPhotoUrl(photo, `${PHOTO_WIDTH}x${PHOTO_HEIGHT}`) }}
          style={styles.photo}
          contentFit="cover"
          transition={200}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    gap: 12,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
});
