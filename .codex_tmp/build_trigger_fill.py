from pathlib import Path
import json

base = Path("/private/tmp/trigger_fill")
base.mkdir(parents=True, exist_ok=True)

answers = {
    16: """USE YGGL;
GO
CREATE TRIGGER t1
ON Employees
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        WHERE NOT EXISTS (
            SELECT 1
            FROM Departments AS d
            WHERE d.DepartmentID = i.DepartmentID
        )
    )
    BEGIN
        RAISERROR('部门编号不存在，不能插入或修改该员工记录。', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END;
GO""",
    18: """USE YGGL;
GO
CREATE TRIGGER t2
ON Employees
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(EmployeeID)
    BEGIN
        UPDATE s
        SET s.EmployeeID = i.EmployeeID
        FROM Salary AS s
        INNER JOIN deleted AS d ON s.EmployeeID = d.EmployeeID
        INNER JOIN inserted AS i ON d.EmployeeID <> i.EmployeeID;
    END
END;
GO""",
    20: """USE YGGL;
GO
CREATE TRIGGER t3
ON Departments
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DELETE e
    FROM Employees AS e
    INNER JOIN deleted AS d ON e.DepartmentID = d.DepartmentID;

    DELETE dep
    FROM Departments AS dep
    INNER JOIN deleted AS d ON dep.DepartmentID = d.DepartmentID;
END;
GO""",
    22: """USE YGGL;
GO
CREATE VIEW yg_view
AS
SELECT
    e.EmployeeID AS 员工编号,
    e.Name AS 姓名,
    e.Birthday AS 生日,
    e.Sex AS 性别,
    d.DepartmentName AS 所在部门,
    s.Income AS 收入,
    s.Outcome AS 支出
FROM Employees AS e
INNER JOIN Departments AS d ON e.DepartmentID = d.DepartmentID
INNER JOIN Salary AS s ON e.EmployeeID = s.EmployeeID;
GO

CREATE TRIGGER t4
ON yg_view
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        WHERE NOT EXISTS (
            SELECT 1
            FROM Departments AS d
            WHERE d.DepartmentName = i.所在部门
        )
    )
    BEGIN
        RAISERROR('所在部门不存在，不能向视图插入该记录。', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    INSERT INTO Employees(EmployeeID, Name, Birthday, Sex, Education, WorkYear, DepartmentID)
    SELECT i.员工编号, i.姓名, i.生日, i.性别, '本科', 0, d.DepartmentID
    FROM inserted AS i
    INNER JOIN Departments AS d ON d.DepartmentName = i.所在部门;

    INSERT INTO Salary(EmployeeID, Income, Outcome)
    SELECT 员工编号, 收入, 支出
    FROM inserted;
END;
GO""",
    24: """USE YGGL;
GO
CREATE TRIGGER t5
ON DATABASE
FOR DROP_TABLE
AS
BEGIN
    PRINT '不能删除表';
    ROLLBACK;
END;
GO""",
    26: """USE YGGL;
GO
CREATE TRIGGER t6
ON Employees
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(WorkYear)
    BEGIN
        UPDATE s
        SET s.Income = s.Income + (i.WorkYear - d.WorkYear) * 500
        FROM Salary AS s
        INNER JOIN inserted AS i ON s.EmployeeID = i.EmployeeID
        INNER JOIN deleted AS d ON i.EmployeeID = d.EmployeeID
        WHERE i.WorkYear > d.WorkYear;
    END
END;
GO""",
    28: """USE YGGL;
GO
CREATE TRIGGER t7
ON Salary
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(Income)
    BEGIN
        UPDATE s
        SET s.Outcome = s.Outcome + ((i.Income - d.Income) / 500) * 50
        FROM Salary AS s
        INNER JOIN inserted AS i ON s.EmployeeID = i.EmployeeID
        INNER JOIN deleted AS d ON i.EmployeeID = d.EmployeeID
        WHERE i.Income > d.Income
          AND (i.Income - d.Income) % 500 = 0;
    END
END;
GO""",
    30: """USE YGGL;
GO
DROP TRIGGER t7;
GO
ALTER TRIGGER t6
ON Employees
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(WorkYear)
    BEGIN
        UPDATE s
        SET s.Income = s.Income + (i.WorkYear - d.WorkYear) * 500,
            s.Outcome = s.Outcome + (i.WorkYear - d.WorkYear) * 50
        FROM Salary AS s
        INNER JOIN inserted AS i ON s.EmployeeID = i.EmployeeID
        INNER JOIN deleted AS d ON i.EmployeeID = d.EmployeeID
        WHERE i.WorkYear > d.WorkYear;
    END
END;
GO""",
    31: """USE YGGL;
GO
SELECT name AS 触发器名,
       parent_class_desc AS 所属范围,
       type_desc AS 触发器类型,
       create_date AS 创建时间,
       modify_date AS 修改时间
FROM sys.triggers;
GO""",
    35: """USE Sale;
GO
CREATE TRIGGER tr_入库表_更新库存
ON [入库表]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH change_qty AS (
        SELECT [产品编号], SUM([数量]) AS qty
        FROM inserted
        GROUP BY [产品编号]
        UNION ALL
        SELECT [产品编号], -SUM([数量]) AS qty
        FROM deleted
        GROUP BY [产品编号]
    ),
    total_change AS (
        SELECT [产品编号], SUM(qty) AS qty
        FROM change_qty
        GROUP BY [产品编号]
    )
    UPDATE p
    SET p.[库存数量] = p.[库存数量] + c.qty
    FROM [产品表] AS p
    INNER JOIN total_change AS c ON p.[产品编号] = c.[产品编号];
END;
GO""",
    37: """USE Sale;
GO
CREATE TRIGGER tr_销售表_更新库存
ON [销售表]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH change_qty AS (
        SELECT [产品编号], -SUM([数量]) AS qty
        FROM inserted
        GROUP BY [产品编号]
        UNION ALL
        SELECT [产品编号], SUM([数量]) AS qty
        FROM deleted
        GROUP BY [产品编号]
    ),
    total_change AS (
        SELECT [产品编号], SUM(qty) AS qty
        FROM change_qty
        GROUP BY [产品编号]
    )
    UPDATE p
    SET p.[库存数量] = p.[库存数量] + c.qty
    FROM [产品表] AS p
    INNER JOIN total_change AS c ON p.[产品编号] = c.[产品编号];
END;
GO""",
    39: """USE Sale;
GO
ALTER TRIGGER tr_入库表_更新库存
ON [入库表]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (SELECT 1 FROM deleted)
       AND NOT (UPDATE([产品编号]) OR UPDATE([数量]))
        RETURN;

    ;WITH change_qty AS (
        SELECT [产品编号], SUM([数量]) AS qty
        FROM inserted
        GROUP BY [产品编号]
        UNION ALL
        SELECT [产品编号], -SUM([数量]) AS qty
        FROM deleted
        GROUP BY [产品编号]
    ),
    total_change AS (
        SELECT [产品编号], SUM(qty) AS qty
        FROM change_qty
        GROUP BY [产品编号]
    )
    UPDATE p
    SET p.[库存数量] = p.[库存数量] + c.qty
    FROM [产品表] AS p
    INNER JOIN total_change AS c ON p.[产品编号] = c.[产品编号];
END;
GO

ALTER TRIGGER tr_销售表_更新库存
ON [销售表]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (SELECT 1 FROM deleted)
       AND NOT (UPDATE([产品编号]) OR UPDATE([数量]))
        RETURN;

    ;WITH change_qty AS (
        SELECT [产品编号], -SUM([数量]) AS qty
        FROM inserted
        GROUP BY [产品编号]
        UNION ALL
        SELECT [产品编号], SUM([数量]) AS qty
        FROM deleted
        GROUP BY [产品编号]
    ),
    total_change AS (
        SELECT [产品编号], SUM(qty) AS qty
        FROM change_qty
        GROUP BY [产品编号]
    )
    UPDATE p
    SET p.[库存数量] = p.[库存数量] + c.qty
    FROM [产品表] AS p
    INNER JOIN total_change AS c ON p.[产品编号] = c.[产品编号];
END;
GO""",
}

for index, text in answers.items():
    (base / f"answer_{index}.txt").write_text(text, encoding="utf-8")

script = [
    'on readAnswer(n)',
    '    set f to POSIX file ("/private/tmp/trigger_fill/answer_" & n & ".txt")',
    '    return read f as «class utf8»',
    'end readAnswer',
    '',
    'on fillParagraph(docRef, n)',
    '    set answerText to my readAnswer(n)',
    '    tell application "Microsoft Word"',
    '        set content of text object of paragraph n of docRef to answerText & return',
    '    end tell',
    'end fillParagraph',
    '',
    'tell application "Microsoft Word"',
    '    set docRef to open file name "/private/tmp/trigger_filled_test.doc"',
    'end tell',
]

for index in sorted(answers.keys(), reverse=True):
    script.append(f"my fillParagraph(docRef, {index})")

script.extend([
    'tell application "Microsoft Word"',
    '    save docRef',
    '    close docRef saving no',
    'end tell',
])

(base / "fill_test.applescript").write_text("\n".join(script), encoding="utf-8")

script_original = "\n".join(script).replace(
    '"/private/tmp/trigger_filled_test.doc"',
    '"/Users/ryyik/Downloads/03 创建和管理触发器.doc"',
)
(base / "fill_original.applescript").write_text(script_original, encoding="utf-8")

print(json.dumps({"base": str(base), "answers": len(answers)}, ensure_ascii=False))
