// Dùng cùng workbook với Excel để PDF có đúng dữ liệu, bộ lọc và số liệu tổng hợp.
// Trình bày từng bản ghi theo chiều dọc để mô tả dài vẫn đọc được trên khổ A4.
const path = require("path");
const PDFDocument = require("pdfkit");
function displayValue(cell) {
  let value = cell.value;
  if (value && typeof value === "object" && "formula" in value)
    value = value.result;
  // Ngày trong workbook đã cộng UTC+7; đọc bằng UTC để không cộng lệch lần thứ hai.
  if (value instanceof Date)
    return value.toLocaleString("vi-VN", { timeZone: "UTC" });
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value ?? "—")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .normalize("NFC");
}
async function createPdfReport(
  workbook,
  { title, username, now = new Date() },
) {
  const regular = path.join(
    __dirname,
    "..",
    "assets",
    "fonts",
    "NotoSans-Regular.ttf",
  );
  const bold = path.join(
    __dirname,
    "..",
    "assets",
    "fonts",
    "NotoSans-Bold.ttf",
  );
  const doc = new PDFDocument({
    size: "A4",
    margin: 42,
    bufferPages: true,
    autoFirstPage: false,
    info: { Title: title, Author: username, Creator: "Bàn hỗ trợ IT" },
  });
  doc.registerFont("Body", regular).registerFont("Bold", bold);
  const result = new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  // Lặp tiêu đề trên cả các trang được tự tạo khi nội dung một bản ghi quá dài.
  doc.on("pageAdded", () => {
    doc
      .font("Bold")
      .fontSize(12)
      .fillColor("#1f2422")
      .text("BÀN HỖ TRỢ IT", 42, 25);
    doc.font("Body").fontSize(8).fillColor("#555555").text(title, 42, 45);
    doc
      .moveTo(42, 65)
      .lineTo(doc.page.width - 42, 65)
      .strokeColor("#d9d4c5")
      .stroke();
    doc.x = 42;
    doc.y = 80;
    doc.font("Body").fontSize(9).fillColor("#1f2422");
  });
  try {
    doc.addPage();
    doc.font("Bold").fontSize(17).text(title).moveDown(0.5);
    doc
      .font("Body")
      .fontSize(9)
      .text("Người xuất: " + username);
    doc.text(
      "Xuất lúc: " +
        now.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    );
    const sheet = workbook.worksheets[0];
    doc.text("Số bản ghi: " + Math.max(0, sheet.rowCount - 1));
    const summary = workbook.worksheets[1];
    if (summary)
      doc.text("Bộ lọc: " + displayValue(summary.getRow(4).getCell(2)));
    doc.moveDown();
    if (sheet.rowCount <= 1)
      doc.text("Không có dữ liệu phù hợp với bộ lọc đã chọn.");
    for (let index = 2; index <= sheet.rowCount; index++) {
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc
        .font("Bold")
        .fontSize(11)
        .text("Bản ghi " + (index - 1))
        .moveDown(0.4);
      const row = sheet.getRow(index);
      for (let column = 1; column <= sheet.columnCount; column++) {
        const label = sheet.getRow(1).getCell(column).text;
        doc
          .font("Bold")
          .fontSize(9)
          .text(label + ": ", { continued: true });
        doc
          .font("Body")
          .text(displayValue(row.getCell(column)), { lineGap: 2 });
      }
      doc.moveDown(0.7);
    }
    if (summary && summary.rowCount >= 6) {
      doc.addPage();
      doc.font("Bold").fontSize(15).text("Tổng hợp báo cáo").moveDown();
      for (let index = 6; index <= summary.rowCount; index++) {
        const row = summary.getRow(index);
        if (!row.getCell(1).value) {
          doc.moveDown(0.4);
          continue;
        }
        doc
          .font("Body")
          .fontSize(10)
          .text(
            displayValue(row.getCell(1)) + ": " + displayValue(row.getCell(2)),
          );
      }
    }
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      doc
        .font("Body")
        .fontSize(8)
        .fillColor("#666666")
        .text(`Trang ${index + 1} / ${pages.count}`, 42, doc.page.height - 28, {
          lineBreak: false,
        });
    }
    doc.end();
  } catch (error) {
    doc.destroy(error);
  }
  return result;
}
module.exports = { createPdfReport, displayValue };
