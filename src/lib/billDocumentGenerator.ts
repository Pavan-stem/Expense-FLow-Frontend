import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, AlignmentType, BorderStyle, HeadingLevel } from "docx";
import { jsPDF } from "jspdf";
import { getBillData, type Expense, type BillFile } from "./firebase";

export interface FlatBillItem {
  billId: string;
  expenseId: string;
  fileName: string;
  fileType: string;
  fileData?: string;
  uploadDate: string;
  employeeName: string;
  employeeId: string;
  voucherNumber?: string;
  expenseTitle: string;
  vendor: string;
  amount: number;
  expenseDate: string;
  category: string;
}

/**
 * Normalizes an image data URL using an offscreen HTML5 canvas to guarantee
 * valid JPEG format, consistent aspect ratio, and optimized file size for DOCX/PDF export.
 */
export async function normalizeImageForDoc(
  dataUrl: string,
  maxWidth = 1400,
  maxHeight = 1400
): Promise<{ dataUrl: string; u8: Uint8Array; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      resolve(null);
      return;
    }

    // PDF files cannot be rendered directly into image canvas
    if (dataUrl.startsWith("data:application/pdf")) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        let w = img.width || 600;
        let h = img.height || 600;

        // Calculate aspect ratio fit inside bounding box with high DPI
        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.max(120, Math.round(w * ratio));
          h = Math.max(120, Math.round(h * ratio));
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(null);
          return;
        }

        // Enable high-quality image smoothing for crisp receipt text
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Fill crisp white background (handling transparent PNGs)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
        const base64Str = jpegUrl.split(",")[1];
        if (!base64Str) {
          resolve(null);
          return;
        }

        const raw = atob(base64Str);
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          u8[i] = raw.charCodeAt(i);
        }

        resolve({ dataUrl: jpegUrl, u8, width: canvas.width, height: canvas.height });
      } catch (err) {
        console.error("Error drawing image to canvas:", err);
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = dataUrl;
  });
}

/**
 * Collects all bill items from a list of expenses and loads full fileData if stored in chunks.
 */
export async function collectBillItems(
  expenses: Expense[],
  onProgress?: (current: number, total: number) => void
): Promise<FlatBillItem[]> {
  const flatItems: FlatBillItem[] = [];

  // Count total bills
  let totalBills = 0;
  expenses.forEach((e) => {
    totalBills += (e.bills || []).length;
  });

  let processedCount = 0;

  for (const exp of expenses) {
    const bills = exp.bills || [];
    for (const bill of bills) {
      let data = bill.fileData;

      // Fetch from bill_chunks if not present in inline bill object
      if (!data) {
        try {
          data = await getBillData(exp.id, bill.id);
        } catch (err) {
          console.error(`Failed to load bill data for bill ${bill.id}:`, err);
        }
      }

      flatItems.push({
        billId: bill.id,
        expenseId: exp.id,
        fileName: bill.fileName || "Bill_Receipt",
        fileType: bill.fileType || "image/jpeg",
        fileData: data,
        uploadDate: bill.uploadDate || exp.date || new Date().toISOString().split("T")[0],
        employeeName: exp.employeeName || "Employee",
        employeeId: exp.employeeId || "EMP",
        voucherNumber: exp.voucherNumber || exp.billNumber || "N/A",
        expenseTitle: exp.title || "Expense Claim",
        vendor: exp.vendor || "N/A",
        amount: exp.totalAmount || exp.amount || 0,
        expenseDate: exp.date || new Date().toISOString().split("T")[0],
        category: exp.category || "General",
      });

      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalBills);
      }
    }
  }

  return flatItems;
}

/**
 * Format clean filename: Bills_[EmployeeName]_[YYYY-MM-DD].ext
 */
export function generateBillFilename(
  employeeName: string,
  extension: "docx" | "pdf",
  customDate?: string
): string {
  const sanitizeName = (employeeName || "Employee")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const dateStr = customDate || new Date().toISOString().split("T")[0];
  return `Bills_${sanitizeName}_${dateStr}.${extension}`;
}

/**
 * Generates and downloads a Word Document (.docx) with 9 to 12 images per page/grid layout.
 */
export async function exportBillsToWordDocx(
  bills: FlatBillItem[],
  employeeName: string,
  gridDensity: 9 | 12 = 12,
  onProgress?: (status: string) => void
): Promise<void> {
  if (onProgress) onProgress("Preparing images for Word Document...");

  const cols = 3;
  const targetPerSheet = gridDensity; // 9 or 12 images per page layout
  const uploadDate = new Date().toISOString().split("T")[0];

  // Process and normalize images
  const processedBills: Array<{
    item: FlatBillItem;
    normalized: { dataUrl: string; u8: Uint8Array; width: number; height: number } | null;
  }> = [];

  for (let i = 0; i < bills.length; i++) {
    const item = bills[i];
    if (onProgress) onProgress(`Processing receipt image ${i + 1} of ${bills.length}...`);
    let norm = null;
    if (item.fileData) {
      norm = await normalizeImageForDoc(item.fileData, 1200, 1200);
    }
    processedBills.push({ item, normalized: norm });
  }

  if (onProgress) onProgress("Constructing Word Document layout...");

  // Build document sections & tables
  const docChildren: (Paragraph | Table)[] = [];

  // Header Banner
  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `EMPLOYEE BILL RECEIPTS DOCUMENT`,
          bold: true,
          size: 28,
          color: "1E293B",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Employee Name: `,
          bold: true,
          size: 20,
          color: "475569",
        }),
        new TextRun({
          text: `${employeeName}    |    `,
          size: 20,
          color: "0F172A",
        }),
        new TextRun({
          text: `Total Bills: `,
          bold: true,
          size: 20,
          color: "475569",
        }),
        new TextRun({
          text: `${bills.length} Receipts    |    `,
          size: 20,
          color: "0F172A",
        }),
        new TextRun({
          text: `Export Date: `,
          bold: true,
          size: 20,
          color: "475569",
        }),
        new TextRun({
          text: `${uploadDate}`,
          size: 20,
          color: "0F172A",
        }),
      ],
    }),
    new Paragraph({
      text: "",
      spacing: { after: 200 },
    })
  );

  // Group bills into chunks of 9 or 12 per page
  const pageChunks: typeof processedBills[] = [];
  for (let i = 0; i < processedBills.length; i += targetPerSheet) {
    pageChunks.push(processedBills.slice(i, i + targetPerSheet));
  }

  pageChunks.forEach((chunk, pageIdx) => {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Page ${pageIdx + 1} - Receipts (${chunk.length} Images Aligned in ${gridDensity}-Grid)`,
            bold: true,
            size: 22,
            color: "4F46E5",
          }),
        ],
        spacing: { before: 200, after: 120 },
      })
    );

    // Build 3-column table for grid layout
    const tableRows: TableRow[] = [];
    for (let r = 0; r < chunk.length; r += cols) {
      const rowItems = chunk.slice(r, r + cols);
      const cells: TableCell[] = [];

      for (let c = 0; c < cols; c++) {
        if (c < rowItems.length) {
          const { item, normalized } = rowItems[c];
          const cellChildren: (Paragraph)[] = [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `#${r + c + 1} ${item.expenseTitle}`,
                  bold: true,
                  size: 16,
                  color: "1E293B",
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Employee: ${item.employeeName}`,
                  size: 13,
                  color: "475569",
                  bold: true,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Voucher: ${item.voucherNumber} | ₹${item.amount}`,
                  size: 14,
                  color: "059669",
                  bold: true,
                }),
              ],
            }),
          ];

          if (normalized) {
            const cellMaxW = 165;
            const cellMaxH = 190;
            const aspect = (normalized.width || 1) / (normalized.height || 1);
            let imgW = cellMaxW;
            let imgH = Math.round(cellMaxW / aspect);
            if (imgH > cellMaxH) {
              imgH = cellMaxH;
              imgW = Math.round(cellMaxH * aspect);
            }

            cellChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: normalized.u8,
                    transformation: {
                      width: Math.max(40, imgW),
                      height: Math.max(40, imgH),
                    },
                  } as unknown as any),
                ],
                spacing: { before: 80, after: 80 },
              })
            );
          } else {
            cellChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `[No Image Preview Available / PDF File]`,
                    size: 14,
                    italics: true,
                    color: "94A3B8",
                  }),
                ],
                spacing: { before: 100, after: 100 },
              })
            );
          }

          cellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Uploaded: ${item.uploadDate}`,
                  size: 12,
                  color: "64748B",
                }),
              ],
            })
          );

          cells.push(
            new TableCell({
              children: cellChildren,
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              },
            })
          );
        } else {
          // Empty cell filler for symmetry
          cells.push(
            new TableCell({
              children: [new Paragraph({ text: "" })],
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              },
            })
          );
        }
      }

      tableRows.push(
        new TableRow({
          children: cells,
        })
      );
    }

    docChildren.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    docChildren.push(
      new Paragraph({
        text: "",
        spacing: { after: 300 },
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  if (onProgress) onProgress("Packaging Word Document file...");
  const blob = await Packer.toBlob(doc);

  // Trigger download
  const filename = generateBillFilename(employeeName, "docx", uploadDate);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a PDF document with 9 to 12 images aligned per page in a 3x3 or 3x4 grid.
 */
export async function exportBillsToPDF(
  bills: FlatBillItem[],
  employeeName: string,
  gridDensity: 9 | 12 = 12,
  onProgress?: (status: string) => void
): Promise<void> {
  if (onProgress) onProgress("Initializing PDF layout generator...");

  const uploadDate = new Date().toISOString().split("T")[0];
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const margin = 10;
  const contentWidth = pageWidth - margin * 2; // 190mm

  // Pre-process images
  const processedBills: Array<{
    item: FlatBillItem;
    normalized: { dataUrl: string; u8: Uint8Array; width: number; height: number } | null;
  }> = [];

  for (let i = 0; i < bills.length; i++) {
    const item = bills[i];
    if (onProgress) onProgress(`Preparing image ${i + 1} of ${bills.length} for PDF...`);
    let norm = null;
    if (item.fileData) {
      norm = await normalizeImageForDoc(item.fileData, 1200, 1200);
    }
    processedBills.push({ item, normalized: norm });
  }

  const numCols = 3;
  const numRows = gridDensity === 9 ? 3 : 4; // 3x3 (9) or 3x4 (12)
  const itemsPerPage = numCols * numRows;

  const totalPages = Math.ceil(processedBills.length / itemsPerPage) || 1;

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();

    // Draw Page Header Banner
    pdf.setFillColor(248, 250, 252); // Slate-50
    pdf.rect(0, 0, pageWidth, 26, "F");

    pdf.setDrawColor(226, 232, 240); // Slate-200
    pdf.line(0, 26, pageWidth, 26);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(30, 41, 59); // Slate-800
    pdf.text("EMPLOYEE BILL RECEIPTS DOCUMENT", margin, 10);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(71, 85, 105); // Slate-600
    pdf.text(`Employee: ${employeeName}`, margin, 17);
    pdf.text(`Date Uploaded/Exported: ${uploadDate}`, margin + 80, 17);
    pdf.text(`Total Bills: ${bills.length} | Page ${p + 1} of ${totalPages}`, margin + 145, 17);

    // Calculate grid card dimensions
    const topOffset = 30;
    const availableHeight = pageHeight - topOffset - margin - 8; // mm
    const cardGap = 3; // mm
    const cardWidth = (contentWidth - cardGap * (numCols - 1)) / numCols;
    const cardHeight = (availableHeight - cardGap * (numRows - 1)) / numRows;

    const pageSlice = processedBills.slice(p * itemsPerPage, (p + 1) * itemsPerPage);

    pageSlice.forEach(({ item, normalized }, idx) => {
      const colIdx = idx % numCols;
      const rowIdx = Math.floor(idx / numCols);

      const cardX = margin + colIdx * (cardWidth + cardGap);
      const cardY = topOffset + rowIdx * (cardHeight + cardGap);

      // Card Container Frame
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(203, 213, 225); // Slate-300
      pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, "FD");

      // Card Header Text
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(15, 23, 42);
      const titleText = `${p * itemsPerPage + idx + 1}. ${item.expenseTitle}`;
      pdf.text(titleText.length > 22 ? titleText.substring(0, 20) + "..." : titleText, cardX + 2, cardY + 4);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6);
      pdf.setTextColor(71, 85, 105); // Slate-600
      const empText = `Emp: ${item.employeeName}`;
      pdf.text(empText.length > 24 ? empText.substring(0, 22) + "..." : empText, cardX + 2, cardY + 7.5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(5, 150, 105); // Emerald-600
      pdf.text(`Vchr: ${item.voucherNumber} | RS.${item.amount}`, cardX + 2, cardY + 11);

      // Image Box inside card
      const imgBoxY = cardY + 12.5;
      const imgBoxHeight = cardHeight - 18.5;
      const imgBoxWidth = cardWidth - 4;
      const imgBoxX = cardX + 2;

      if (normalized) {
        try {
          // Fit image maintaining aspect ratio
          let drawW = imgBoxWidth;
          let drawH = imgBoxHeight;
          const imgRatio = normalized.width / normalized.height;
          const boxRatio = imgBoxWidth / imgBoxHeight;

          if (imgRatio > boxRatio) {
            drawH = imgBoxWidth / imgRatio;
          } else {
            drawW = imgBoxHeight * imgRatio;
          }

          const drawX = imgBoxX + (imgBoxWidth - drawW) / 2;
          const drawY = imgBoxY + (imgBoxHeight - drawH) / 2;

          pdf.addImage(normalized.dataUrl, "JPEG", drawX, drawY, drawW, drawH);
        } catch (err) {
          console.error("PDF image render error:", err);
          pdf.setFillColor(241, 245, 249);
          pdf.rect(imgBoxX, imgBoxY, imgBoxWidth, imgBoxHeight, "F");
          pdf.setFontSize(6);
          pdf.setTextColor(148, 163, 184);
          pdf.text("Image Error", imgBoxX + 2, imgBoxY + imgBoxHeight / 2);
        }
      } else {
        // Placeholder for missing image or PDF attachment
        pdf.setFillColor(241, 245, 249);
        pdf.rect(imgBoxX, imgBoxY, imgBoxWidth, imgBoxHeight, "F");
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(6);
        pdf.setTextColor(100, 116, 139);
        pdf.text("No Preview / PDF Attachment", imgBoxX + 1, imgBoxY + imgBoxHeight / 2);
      }

      // Card Footer
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Uploaded: ${item.uploadDate}`, cardX + 2, cardY + cardHeight - 2);
    });

    // Page Footer
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `ExpenseFlow Digital Bill Vault - Generated for ${employeeName} on ${uploadDate}`,
      margin,
      pageHeight - 4
    );
  }

  if (onProgress) onProgress("Saving PDF file...");
  const filename = generateBillFilename(employeeName, "pdf", uploadDate);
  pdf.save(filename);
}
