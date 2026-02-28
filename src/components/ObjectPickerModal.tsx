import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { IoBrokerClient } from "../services/iobroker";
import { IoBrokerObjectEntry } from "../types/dashboard";
import { palette } from "../utils/theme";

type ObjectPickerModalProps = {
  client: IoBrokerClient;
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (entry: IoBrokerObjectEntry) => void;
};

type TreeNode = {
  id: string;
  label: string;
  fullId?: string;
  children: TreeNode[];
};

export function ObjectPickerModal({
  client,
  visible,
  title,
  onClose,
  onSelect,
}: ObjectPickerModalProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<IoBrokerObjectEntry[]>([]);
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
      .listObjects(query)
      .then((nextEntries) => {
        if (!active) {
          return;
        }
        setEntries(nextEntries);
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Objekte konnten nicht geladen werden");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, query, visible]);

  const tree = useMemo(() => buildTree(entries), [entries]);

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </Pressable>
          </View>
          <TextInput
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder="Nach Objekt-ID oder Name filtern"
            placeholderTextColor={palette.textMuted}
            style={styles.searchInput}
            value={query}
          />
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{entries.length} Treffer</Text>
            {loading ? <ActivityIndicator color={palette.accent} size="small" /> : null}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <ScrollView style={styles.treeScroll}>
            {tree.length ? (
              tree.map((node) => (
                <TreeBranch key={node.id} node={node} onSelect={onSelect} />
              ))
            ) : (
              <Text style={styles.emptyText}>{loading ? "Lade Objektbaum..." : "Keine Objekte gefunden"}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TreeBranch({
  node,
  depth = 0,
  onSelect,
}: {
  node: TreeNode;
  depth?: number;
  onSelect: (entry: IoBrokerObjectEntry) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  if (!hasChildren && node.fullId) {
    const fullId = node.fullId;
    return (
      <Pressable
        onPress={() => onSelect({ id: fullId, name: node.label })}
        style={[styles.leafRow, { paddingLeft: 14 + depth * 16 }]}
      >
        <Text style={styles.leafTitle}>{node.label}</Text>
        <Text numberOfLines={1} style={styles.leafId}>
          {fullId}
        </Text>
      </Pressable>
    );
  }

  return (
    <View>
      <Pressable onPress={() => setExpanded((current) => !current)} style={[styles.branchRow, { paddingLeft: 14 + depth * 16 }]}>
        <Text style={styles.branchToggle}>{expanded ? "▾" : "▸"}</Text>
        <Text style={styles.branchLabel}>{node.label}</Text>
      </Pressable>
      {expanded
        ? node.children.map((child) => (
            <TreeBranch key={child.id} depth={depth + 1} node={child} onSelect={onSelect} />
          ))
        : null}
    </View>
  );
}

function buildTree(entries: IoBrokerObjectEntry[]): TreeNode[] {
  const root = new Map<string, TreeNode>();

  entries.forEach((entry) => {
    const parts = entry.id.split(".");
    let currentLevel = root;
    let runningId = "";

    parts.forEach((part, index) => {
      runningId = runningId ? `${runningId}.${part}` : part;
      let nextNode = currentLevel.get(part);
      if (!nextNode) {
        nextNode = {
          id: runningId,
          label: part,
          children: [],
        };
        currentLevel.set(part, nextNode);
      }

      if (index === parts.length - 1) {
        nextNode.label = entry.name || part;
        nextNode.fullId = entry.id;
      }

      currentLevel = toChildMap(nextNode);
    });
  });

  return sortNodes([...root.values()]);
}

function toChildMap(node: TreeNode) {
  const map = new Map<string, TreeNode>();
  node.children.forEach((child) => {
    map.set(child.id.split(".").pop() || child.id, child);
  });

  const originalSet = map.set.bind(map);
  map.set = (key: string, value: TreeNode) => {
    if (!node.children.includes(value)) {
      node.children.push(value);
    }
    return originalSet(key, value);
  };

  return map;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortNodes(node.children),
    }))
    .sort((a, b) => {
      const aLeaf = Boolean(a.fullId);
      const bLeaf = Boolean(b.fullId);
      if (aLeaf !== bLeaf) {
        return aLeaf ? 1 : -1;
      }
      return a.label.localeCompare(b.label, "de");
    });
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
    marginBottom: 12,
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
  searchInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    color: palette.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metaRow: {
    marginTop: 10,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaText: {
    color: palette.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: palette.danger,
    marginBottom: 10,
  },
  treeScroll: {
    maxHeight: 460,
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    borderRadius: 12,
  },
  branchToggle: {
    width: 16,
    color: palette.textMuted,
  },
  branchLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  leafRow: {
    paddingVertical: 8,
    borderRadius: 12,
  },
  leafTitle: {
    color: palette.text,
    fontWeight: "700",
  },
  leafId: {
    color: palette.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: palette.textMuted,
    paddingVertical: 18,
  },
});
