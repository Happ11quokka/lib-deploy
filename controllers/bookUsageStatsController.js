const db = require("../config/db");

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const refreshBookUsageStats = async (evaluationDate = new Date()) => {
  const evaluationDay = formatDate(evaluationDate);

  await db.query(`DELETE FROM BookUsageStats`);

  await db.query(
    `
      INSERT INTO BookUsageStats (book_id, borrow_count, avg_borrow_duration, available_ratio, last_updated)
      SELECT
        b.book_id,
        COALESCE(br.borrow_count, 0) AS borrow_count,
        br.avg_duration,
        bc.available_ratio,
        NOW() AS last_updated
      FROM Book b
      LEFT JOIN (
        SELECT
          book_id,
          COUNT(*) AS borrow_count,
          ROUND(
            AVG(
              DATEDIFF(
                CASE
                  WHEN return_date IS NOT NULL THEN return_date
                  ELSE ?
                END,
                borrow_date
              )
            ),
            2
          ) AS avg_duration
        FROM BorrowRecord
        GROUP BY book_id
      ) AS br ON br.book_id = b.book_id
      LEFT JOIN (
        SELECT
          book_id,
          ROUND(
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(*), 0),
            2
          ) AS available_ratio
        FROM BookCopy
        GROUP BY book_id
      ) AS bc ON bc.book_id = b.book_id
    `,
    [evaluationDay]
  );
};

const getBookUsageStatsPage = async (req, res, next) => {
  try {
    await refreshBookUsageStats(new Date());

    const [rows] = await db.query(
      `
        SELECT
          s.stat_id,
          b.book_id,
          b.title,
          a.author_name AS author_name,
          (
            SELECT GROUP_CONCAT(DISTINCT c.category_name ORDER BY c.category_name SEPARATOR ', ')
            FROM BookCategory bc
            JOIN Category c ON bc.category_id = c.category_id
            WHERE bc.book_id = b.book_id
          ) AS categories,
          s.borrow_count,
          s.avg_borrow_duration,
          s.available_ratio,
          DATE_FORMAT(s.last_updated, '%Y-%m-%d %H:%i:%s') AS last_updated
        FROM BookUsageStats s
        JOIN Book b ON s.book_id = b.book_id
        LEFT JOIN Author a ON b.author_id = a.author_id
        ORDER BY s.borrow_count DESC, b.title ASC
      `
    );

    const stats = rows.map((row) => {
      const avgBorrowDuration =
        row.avg_borrow_duration === null
          ? null
          : Number(row.avg_borrow_duration);
      const availableRatio =
        row.available_ratio === null ? null : Number(row.available_ratio);

      return {
        statId: row.stat_id,
        bookId: row.book_id,
        title: row.title,
        authorName: row.author_name || "-",
        categories: row.categories || "-",
        borrowCount: row.borrow_count,
        avgBorrowDuration,
        availableRatio,
        avgBorrowDurationDisplay:
          avgBorrowDuration === null
            ? "-"
            : avgBorrowDuration.toFixed(2),
        availablePercentage:
          availableRatio === null
            ? "-"
            : `${Math.round(availableRatio * 100)}%`,
        lastUpdated: row.last_updated,
      };
    });

    const aggregate = stats.reduce(
      (acc, row) => {
        acc.totalBorrowCount += row.borrowCount;
        if (row.availableRatio !== null) {
          acc.availableRatioSum += row.availableRatio;
          acc.availableRatioCount += 1;
        }
        return acc;
      },
      { totalBorrowCount: 0, availableRatioSum: 0, availableRatioCount: 0 }
    );

    const averageAvailability =
      aggregate.availableRatioCount > 0
        ? aggregate.availableRatioSum / aggregate.availableRatioCount
        : null;

    res.render("pages/book-usage-stats", {
      title: "Book Usage Statistics",
      stats,
      totalBorrowCount: aggregate.totalBorrowCount,
      averageAvailability:
        averageAvailability === null
          ? "-"
          : `${Math.round(averageAvailability * 100)}%`,
      lastUpdated: stats.length > 0 ? stats[0].lastUpdated : null,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getBookUsageStatsPage,
};
