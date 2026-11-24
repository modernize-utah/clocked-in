import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PdfBlock } from "@/lib/report-pdf/blocks";
import { pageContentHeight, pageMargin, pagePaddingBottom, pagePaddingTop } from "@/lib/report-pdf/layout";

export type ReportPdfColors = {
  primary: string;
  foreground: string;
  muted: string;
  line: string;
};

type ReportPdfDocumentProps = {
  title: string;
  tenantName: string;
  logoSrc: string | null;
  filterSummary: string;
  blocks: PdfBlock[];
  colors: ReportPdfColors;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: pagePaddingTop,
    paddingBottom: pagePaddingBottom,
    paddingHorizontal: pageMargin,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
  },
  header: {
    position: "absolute",
    top: pageMargin,
    left: pageMargin,
    right: pageMargin,
    height: 28,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  headerName: {
    fontSize: 9,
    color: "#4a4a4a",
  },
  logo: {
    height: 20,
    width: 20,
    objectFit: "contain",
  },
  footer: {
    position: "absolute",
    bottom: pageMargin,
    left: pageMargin,
    right: pageMargin,
    height: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#6b6b6b",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  filters: {
    fontSize: 9,
    color: "#4a4a4a",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
    padding: 8,
  },
  kpiLabel: {
    fontSize: 8,
    color: "#4a4a4a",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f4",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d4",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    flex: 1,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  td: {
    flex: 1,
    fontSize: 8,
  },
  chartImage: {
    width: "100%",
    objectFit: "contain",
  },
  legend: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 3,
  },
  legendRow: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  legendLabel: {
    flex: 1,
    fontSize: 8,
  },
  legendValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  empty: {
    fontSize: 8,
    color: "#6b6b6b",
  },
});

function Header({ tenantName, logoSrc }: { tenantName: string; logoSrc: string | null }) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.headerName}>{tenantName}</Text>
      {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
    </View>
  );
}

function Footer({ tenantName }: { tenantName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>{tenantName}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function KpiRow({ items }: { items: Extract<PdfBlock, { kind: "kpis" }>["items"] }) {
  return (
    <View style={styles.kpiRow} wrap={false}>
      {items.map((item) => (
        <View key={item.title} style={styles.kpi}>
          <Text style={styles.kpiLabel}>{item.title}</Text>
          <Text style={styles.kpiValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function TableBlock({ block }: { block: Extract<PdfBlock, { kind: "table" }> }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{block.title}</Text>
      {block.rows.length === 0 ? (
        <Text style={styles.empty}>No rows in this range.</Text>
      ) : (
        <>
          <View style={styles.tableHeader} wrap={false}>
            {block.headers.map((header) => (
              <Text key={header} style={styles.th}>
                {header}
              </Text>
            ))}
          </View>
          {block.rows.map((row, index) => (
            <View key={`${block.title}-${index}`} style={styles.tableRow} wrap={false}>
              {row.map((cell, cellIndex) => (
                <Text key={`${block.title}-${index}-${cellIndex}`} style={styles.td}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function ChartBlock({ block }: { block: Extract<PdfBlock, { kind: "chart" }> }) {
  const height = Math.min(block.height, pageContentHeight - 64);
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{block.title}</Text>
      {block.image ? (
        <Image src={block.image} style={{ ...styles.chartImage, height }} />
      ) : block.rows.length === 0 ? (
        <Text style={styles.empty}>No hours in this range.</Text>
      ) : null}
      {block.legend.length > 0 ? (
        <View style={styles.legend}>
          {block.legend.slice(0, 12).map((item) => (
            <View key={item.label} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <Text style={styles.legendLabel}>{item.label}</Text>
              <Text style={styles.legendValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ReportPdfDocument({
  title,
  tenantName,
  logoSrc,
  filterSummary,
  blocks,
  colors,
}: ReportPdfDocumentProps) {
  return (
    <Document title={title} author={tenantName} creator="VolunTime">
      <Page size="LETTER" style={{ ...styles.page, color: colors.foreground }}>
        <Header tenantName={tenantName} logoSrc={logoSrc} />
        <View>
          <Text style={{ ...styles.title, color: colors.primary }}>{title}</Text>
          <Text style={styles.filters}>{filterSummary}</Text>
        </View>
        {blocks.map((block, index) => {
          if (block.kind === "kpis") return <KpiRow key={`kpis-${index}`} items={block.items} />;
          if (block.kind === "table") return <TableBlock key={`table-${block.title}-${index}`} block={block} />;
          return <ChartBlock key={block.id} block={block} />;
        })}
        <Footer tenantName={tenantName} />
      </Page>
    </Document>
  );
}
