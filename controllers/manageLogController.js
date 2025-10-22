const db = require("../config/db");
// 추가 기능 1: 관리 로그 페이지 조회
const getManageLogsPage = async (req, res, next) => {
  try {
    const [logs] = await db.query(
      `
        SELECT 
          ml.log_id,
          ml.book_id,
          ml.book_title,
          ml.action_type,
          ml.change_amount,
          ml.action_date,
          ad.admin_code,
          adminUsers.user_name AS admin_name
        FROM ManageLog ml
        LEFT JOIN Admin ad ON ml.admin_id = ad.admin_id
        LEFT JOIN (
          SELECT admin_id, MIN(user_name) AS user_name
          FROM User
          WHERE role_id = (
            SELECT role_id FROM Role WHERE role_name = 'admin' LIMIT 1
          )
          GROUP BY admin_id
        ) adminUsers ON ml.admin_id = adminUsers.admin_id
        ORDER BY ml.action_date DESC, ml.log_id DESC
      `
    );

    const formattedLogs = logs.map((log) => {
      const actionDate =
        log.action_date instanceof Date
          ? log.action_date
          : new Date(log.action_date);
      const numericChange = Number(log.change_amount);
      const changeLabel = Number.isNaN(numericChange)
        ? "-"
        : numericChange > 0
        ? `+${numericChange}`
        : `${numericChange}`;
      const adminLabel =
        log.admin_name ||
        (log.admin_code ? `Code ${log.admin_code}` : "Unknown admin");
      const bookReference =
        log.book_id !== null && log.book_id !== undefined
          ? `#${log.book_id}`
          : "-";

      const displayDate = !Number.isNaN(actionDate.getTime())
        ? actionDate.toLocaleString()
        : "";

      return {
        ...log,
        changeLabel,
        adminLabel,
        bookReference,
        displayDate,
      };
    });

    res.render("pages/manage-logs", {
      title: "Manage Logs",
      logs: formattedLogs,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getManageLogsPage,
};
