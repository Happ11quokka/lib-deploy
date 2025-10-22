const db = require("../config/db");

// TODO 2. 주기별 기간 계산
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMonthInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const parseReferenceDate = (value) => {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = parts[2] ? Number(parts[2]) : 1;

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    month < 1 ||
    month > 12 ||
    (parts[2] && Number.isNaN(day))
  ) {
    return null;
  }

  const date = new Date(year, month - 1, Math.max(1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildMonthlyPeriod = (anchorDate) => {
  const base = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);

  return {
    start: base,
    end,
    label: base.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };
};

const buildQuarterlyPeriod = (anchorDate) => {
  const quarterIndex = Math.floor(anchorDate.getMonth() / 3);
  const start = new Date(anchorDate.getFullYear(), quarterIndex * 3, 1);
  const end = new Date(anchorDate.getFullYear(), quarterIndex * 3 + 3, 0);

  return {
    start,
    end,
    label: `Q${quarterIndex + 1} ${anchorDate.getFullYear()}`,
  };
};

const refreshUserBorrowStats = async (periodStartDate, periodEndDate) => {
  const periodStart = formatDate(periodStartDate);
  const periodEnd = formatDate(periodEndDate);

  const today = new Date();
  let evaluationPoint = today;
  if (evaluationPoint > periodEndDate) {
    evaluationPoint = periodEndDate;
  } else if (evaluationPoint < periodStartDate) {
    evaluationPoint = periodEndDate;
  }
  const evaluationDate = formatDate(evaluationPoint);

  // TODO 1. 주기별 통계 집계 부분
  await db.query(
    `
      DELETE FROM UserBorrowStats
      WHERE period_start = ? AND period_end = ?
    `,
    [periodStart, periodEnd]
  );

  await db.query(
    `
      INSERT INTO UserBorrowStats (user_id, total_borrowed, overdue_count, favorite_category, period_start, period_end)
      SELECT 
        u.user_id,
        COUNT(br.record_id) AS total_borrowed,
        COALESCE(SUM(CASE
          WHEN br.record_id IS NULL THEN 0
          WHEN br.return_date IS NULL AND DATEDIFF(?, br.borrow_date) >= 7 THEN 1
          WHEN br.return_date IS NOT NULL AND DATEDIFF(br.return_date, br.borrow_date) >= 7 THEN 1
          ELSE 0
        END), 0) AS overdue_count,
        (
          SELECT c.category_name
          FROM BorrowRecord br2
          JOIN BookCategory bc2 ON br2.book_id = bc2.book_id
          JOIN Category c ON bc2.category_id = c.category_id
          WHERE br2.user_id = u.user_id
            AND br2.borrow_date BETWEEN ? AND ?
          GROUP BY c.category_name
          ORDER BY COUNT(*) DESC, c.category_name ASC
          LIMIT 1
        ) AS favorite_category,
        ? AS period_start,
        ? AS period_end
      FROM User u
      LEFT JOIN BorrowRecord br ON br.user_id = u.user_id
        AND br.borrow_date BETWEEN ? AND ?
      GROUP BY u.user_id
      HAVING total_borrowed > 0 OR overdue_count > 0
    `,
    [
      evaluationDate,
      periodStart,
      periodEnd,
      periodStart,
      periodEnd,
      periodStart,
      periodEnd,
    ]
  );
};

// TODO 3. 회원별 통계 페이지 렌더링
const getUserBorrowStatsPage = async (req, res, next) => {
  const requestedPeriodType =
    req.query.periodType === "quarterly" ? "quarterly" : "monthly";
  const referenceDate =
    parseReferenceDate(req.query.referenceDate) ?? new Date();
  const period =
    requestedPeriodType === "quarterly"
      ? buildQuarterlyPeriod(referenceDate)
      : buildMonthlyPeriod(referenceDate);

  try {
    await refreshUserBorrowStats(period.start, period.end);

    const [statsRows] = await db.query(
      `
        SELECT 
          s.stat_id,
          s.user_id,
          u.user_name,
          r.role_name AS role_name,
          s.total_borrowed,
          s.overdue_count,
          s.favorite_category,
          DATE_FORMAT(s.period_start, '%Y-%m-%d') AS period_start,
          DATE_FORMAT(s.period_end, '%Y-%m-%d') AS period_end
        FROM UserBorrowStats s
        JOIN User u ON s.user_id = u.user_id
        JOIN Role r ON u.role_id = r.role_id
        WHERE s.period_start = ? AND s.period_end = ?
        ORDER BY u.user_name ASC
      `,
      [formatDate(period.start), formatDate(period.end)]
    );

    const summary = statsRows.reduce(
      (acc, row) => {
        acc.totalBorrowed += row.total_borrowed;
        acc.overdueCount += row.overdue_count;
        return acc;
      },
      { totalBorrowed: 0, overdueCount: 0 }
    );

    res.render("pages/user-borrow-stats", {
      title: "User Borrow Statistics",
      stats: statsRows,
      periodType: requestedPeriodType,
      selectedMonth: formatMonthInputValue(referenceDate),
      periodLabel: period.label,
      periodStart: formatDate(period.start),
      periodEnd: formatDate(period.end),
      summary,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getUserBorrowStatsPage,
};
