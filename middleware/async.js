// Bọc hàm route async: lỗi phát sinh được chuyển qua next(err) tới middleware xử lý lỗi,
// giúp các route dùng wrap không phải lặp lại try/catch cho từng thao tác database.
module.exports = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next);
