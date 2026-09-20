import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatMontant, formatDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#171717" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  companyName: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  muted: { color: "#525252" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 9, textTransform: "uppercase", color: "#737373", marginBottom: 4 },
  table: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 6,
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 6,
    backgroundColor: "#fafafa",
  },
  colDesignation: { flex: 3 },
  colQte: { flex: 1, textAlign: "right" },
  colPrix: { flex: 1.2, textAlign: "right" },
  colTva: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.4, textAlign: "right" },
  totaux: { marginTop: 16, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#171717",
    fontWeight: 700,
  },
  footer: { marginTop: 32, fontSize: 9, color: "#737373" },
});

export type PdfCompanyInfo = {
  nom: string;
  adresse?: string | null;
  ville?: string | null;
  matriculeFiscal?: string | null;
  telephone?: string | null;
  email?: string | null;
};

export type PdfClientInfo = {
  nom: string;
  adresse?: string | null;
  ville?: string | null;
  matriculeFiscal?: string | null;
};

export type PdfLigne = {
  designation: string;
  quantite: number;
  prixUnitaireHT: number;
  tauxTva: number;
  totalHT: number;
};

export function DocumentPdf({
  titre,
  numero,
  dateEmission,
  dateSecondaire,
  labelDateSecondaire,
  company,
  client,
  lignes,
  sousTotalHT,
  totalTva,
  timbreFiscal,
  totalTTC,
  notes,
}: {
  titre: string;
  numero: string;
  dateEmission: Date;
  dateSecondaire?: Date | null;
  labelDateSecondaire?: string;
  company: PdfCompanyInfo;
  client: PdfClientInfo;
  lignes: PdfLigne[];
  sousTotalHT: number;
  totalTva: number;
  timbreFiscal?: number;
  totalTTC: number;
  notes?: string | null;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{company.nom}</Text>
            {company.adresse && <Text style={styles.muted}>{company.adresse}</Text>}
            {company.ville && <Text style={styles.muted}>{company.ville}</Text>}
            {company.matriculeFiscal && (
              <Text style={styles.muted}>MF: {company.matriculeFiscal}</Text>
            )}
            {company.telephone && <Text style={styles.muted}>{company.telephone}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>{titre}</Text>
            <Text>{numero}</Text>
            <Text style={styles.muted}>Emis le {formatDate(dateEmission)}</Text>
            {dateSecondaire && labelDateSecondaire && (
              <Text style={styles.muted}>
                {labelDateSecondaire}: {formatDate(dateSecondaire)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <Text style={{ fontWeight: 700 }}>{client.nom}</Text>
          {client.adresse && <Text style={styles.muted}>{client.adresse}</Text>}
          {client.ville && <Text style={styles.muted}>{client.ville}</Text>}
          {client.matriculeFiscal && <Text style={styles.muted}>MF: {client.matriculeFiscal}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDesignation}>Designation</Text>
            <Text style={styles.colQte}>Qte</Text>
            <Text style={styles.colPrix}>Prix HT</Text>
            <Text style={styles.colTva}>TVA</Text>
            <Text style={styles.colTotal}>Total HT</Text>
          </View>
          {lignes.map((ligne, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDesignation}>{ligne.designation}</Text>
              <Text style={styles.colQte}>{ligne.quantite}</Text>
              <Text style={styles.colPrix}>{formatMontant(ligne.prixUnitaireHT)}</Text>
              <Text style={styles.colTva}>{ligne.tauxTva}%</Text>
              <Text style={styles.colTotal}>{formatMontant(ligne.totalHT)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totaux}>
          <View style={styles.totalRow}>
            <Text>Sous-total HT</Text>
            <Text>{formatMontant(sousTotalHT)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>TVA</Text>
            <Text>{formatMontant(totalTva)}</Text>
          </View>
          {!!timbreFiscal && (
            <View style={styles.totalRow}>
              <Text>Timbre fiscal</Text>
              <Text>{formatMontant(timbreFiscal)}</Text>
            </View>
          )}
          <View style={styles.totalRowFinal}>
            <Text>Total TTC</Text>
            <Text>{formatMontant(totalTTC)}</Text>
          </View>
        </View>

        {notes && (
          <View style={styles.footer}>
            <Text>{notes}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
