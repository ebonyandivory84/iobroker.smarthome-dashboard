import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { IoBrokerClient } from "../services/iobroker";
import { WidgetImageEntry } from "../types/dashboard";
import { palette } from "../utils/theme";

type ImagePickerModalProps = {
  client: IoBrokerClient;
  visible: boolean;
  selectedName?: string;
  onClose: () => void;
  onSelect: (entry: WidgetImageEntry) => void;
};

export function ImagePickerModal({
  client,
  visible,
  selectedName,
  onClose,
  onSelect,
}: ImagePickerModalProps) {
  const [images, setImages] = useState<WidgetImageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    client
      .listWidgetImages()
      .then((entries) => {
        if (active) {
          setImages(entries);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Bilder konnten nicht geladen werden");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, visible]);

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Solar-Hintergrund waehlen</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>Verwendet den festen Ordner `assets/` im Adapter-Paket.</Text>
          {loading ? <ActivityIndicator color={palette.accent} size="small" /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <ScrollView contentContainerStyle={styles.grid}>
            {images.map((image) => {
              const active = selectedName === image.name;
              return (
                <Pressable
                  key={image.name}
                  onPress={() => onSelect(image)}
                  style={[styles.tile, active ? styles.tileActive : null]}
                >
                  <Image source={{ uri: image.url }} style={styles.preview} />
                  <Text numberOfLines={1} style={styles.label}>
                    {image.name}
                  </Text>
                </Pressable>
              );
            })}
            {!loading && !images.length ? <Text style={styles.helper}>Keine Bilder in `assets/` gefunden.</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    maxHeight: "82%",
    borderRadius: 22,
    padding: 18,
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
  },
  close: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  helper: {
    color: palette.textMuted,
    marginBottom: 10,
  },
  error: {
    color: palette.danger,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
    gap: 8,
  },
  tileActive: {
    borderColor: "rgba(92, 124, 255, 0.45)",
    backgroundColor: "rgba(92, 124, 255, 0.08)",
  },
  preview: {
    width: "100%",
    height: 84,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
});
