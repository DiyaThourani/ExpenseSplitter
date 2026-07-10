const express = require('express');
const { Pool, Result } = require('pg');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');


const app = express();
app.use(express.json());
app.use(cors());
function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
}

function fixRoundingDifference(splits, totalAmount) {
    const total = roundMoney(totalAmount);
    const splitTotal = roundMoney(
        splits.reduce((sum, split) => sum + Number(split.amount_owed), 0)
    );

    const difference = roundMoney(total - splitTotal);

    if (splits.length > 0 && Math.abs(difference) > 0) {
        splits[0].amount_owed = roundMoney(
            Number(splits[0].amount_owed) + difference
        );
    }

    return splits;
}

function calculateExpenseSplits({
    totalAmount,
    splitMethod,
    includedMembers,
    acUsers = [],
    acBasePercent = 60,
    customShares = [],
    items = []
}) {
    const total = roundMoney(totalAmount);

    if (!includedMembers || includedMembers.length === 0) {
        throw new Error('At least one member must be included in the split.');
    }

    if (splitMethod === 'equal' || splitMethod === 'exclude') {
        const eachShare = roundMoney(total / includedMembers.length);

        let splits = includedMembers.map(userId => ({
            user_id: Number(userId),
            amount_owed: eachShare
        }));

        return fixRoundingDifference(splits, total);
    }

    if (splitMethod === 'ac_usage') {
        if (!acUsers || acUsers.length === 0) {
            throw new Error('Please select at least one AC user.');
        }

        const basePercent = Number(acBasePercent || 60);
        const acPercent = 100 - basePercent;

        const baseAmount = roundMoney(total * (basePercent / 100));
        const acAmount = roundMoney(total * (acPercent / 100));

        const baseShare = roundMoney(baseAmount / includedMembers.length);
        const acShare = roundMoney(acAmount / acUsers.length);

        const acUserIds = acUsers.map(Number);

        let splits = includedMembers.map(userId => {
            const isAcUser = acUserIds.includes(Number(userId));

            return {
                user_id: Number(userId),
                amount_owed: roundMoney(baseShare + (isAcUser ? acShare : 0))
            };
        });

        return fixRoundingDifference(splits, total);
    }

    if (splitMethod === 'custom') {
        if (!customShares || customShares.length === 0) {
            throw new Error('Custom shares are required.');
        }

        let splits = customShares.map(item => ({
            user_id: Number(item.user_id),
            amount_owed: roundMoney(item.amount_owed)
        }));

        const customTotal = roundMoney(
            splits.reduce((sum, split) => sum + Number(split.amount_owed), 0)
        );

        if (Math.abs(customTotal - total) > 0.01) {
            throw new Error('Custom shares must add up to the total bill amount.');
        }

        return splits;
    }

    if (splitMethod === 'itemized') {
        if (!items || items.length === 0) {
            throw new Error('Items are required for itemized split.');
        }

        const userTotals = {};

        for (const item of items) {
            if (!item.claims || item.claims.length === 0) {
                throw new Error(`Item "${item.item_name}" must have at least one claim.`);
            }

            for (const claim of item.claims) {
                const userId = Number(claim.user_id);
                const shareAmount = roundMoney(claim.share_amount);

                userTotals[userId] = roundMoney((userTotals[userId] || 0) + shareAmount);
            }
        }

        let splits = Object.keys(userTotals).map(userId => ({
            user_id: Number(userId),
            amount_owed: roundMoney(userTotals[userId])
        }));

        const itemizedTotal = roundMoney(
            splits.reduce((sum, split) => sum + Number(split.amount_owed), 0)
        );

        if (Math.abs(itemizedTotal - total) > 0.01) {
            throw new Error('Item claims must add up to the total bill amount.');
        }

        return splits;
    }

    throw new Error('Invalid split method.');
}

//sign up
app.post('/auth/signup', async(req, res) =>{
    const {name, email, password} = req.body;
    try{
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(`insert into users(name, email, password) values ($1, $2, $3) returning user_id, name, email`,
        [name, email, hashedPassword]);
        res.status(201).json(result.rows[0])
    
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'SIGN UP FAILED '})
    }
});
//login
app.post('/auth/login', async(req,res) =>{
    const{email, password} = req.body;
    try{
        const result = await pool.query('select * from users where email = $1', [email]);
        if(result.rows.length === 0){
            return res.status(401).json({error: 'Invalid email or password '});
        }

        const user  = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if(!match){
            return res.status(401).json({error: 'Invalid email or password '});
        }
        res.json({user_id: user.user_id, name: user.name, email: user.email});
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'LOG IN FAILED '});
    }
});

app.get('/users/lookup', async (req, res) => {
    const { email } = req.query;
    try {
        const result = await pool.query(
            'select user_id, name, email from users where lower(trim(email)) = lower(trim($1))',
            [email]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No user with that email' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO LOOK UP USER' });
    }
});
//get by user_id
app.get('/users/:id', async(req, res)=>{
const{id} = req.params;
try{
    const result = await pool.query('Select user_id, name, email, created_at from users where user_id = $1', [id]);
    if(result.rows.length === 0){
        return res.status(404).json({error: 'USER NOT FOUND'});
    }
    res.json(result.rows[0]);
}catch(err){
    console.error(err);
    res.status(500).json({error: 'Error found'});
}
});

// put user 
app.put('/users/:id', async(req, res)=>{
    const {id } = req.params;
    const{name, email} = req.body;
    try{
        const result = await pool.query('update users set name = $1, email = $2 where user_id = $3 returning user_id, name, email, created_at',
            [name, email, id]
        );

        if(result.rows.length === 0){
            return res.status(404).json({error: 'USER NOT FOUND'})
        }
        res.json(result.rows[0]);
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'Failed to update!'});
    }
});
// group creation
app.post('/groups', async (req, res) => {
    const { group_name, currency, created_by } = req.body;
    try {
       
        const groupResult = await pool.query(
            'insert into groups(group_name, currency, created_by) values ($1, $2, $3) returning group_id, group_name, currency, created_by',
            [group_name, currency, created_by]
        );
        const newGroup = groupResult.rows[0];
        await pool.query(
            'insert into group_member(group_id, user_id) values ($1, $2)',
            [newGroup.group_id, created_by]
        );

        res.status(201).json(newGroup);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO CREATE' });
    }
});

//get groups by group id
app.get('/groups/:id', async(req, res)=>{
    const{id} = req.params;
    try{
        const result = await pool.query('select g.* from groups g where g.group_id = $1',[id]);
    if(result.rows.length === 0){
        return res.status(404).json({error: 'GROUP NOT FOUND'});
    }
    res.json(result.rows[0]);

    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO FETCH'});
       }
})
//get groups
app.get('/groups', async(req, res)=>{
    const {user_id } = req.query;
    try{
        const result = await pool.query('select g.* from groups g join group_member gm on g.group_id = gm.group_id where user_id = $1', [user_id]);
    
    res.json(result.rows);
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO FETCH'});
    }
})

// put group by id
app.put('/groups/:id', async(req, res) =>{
    const{id} = req.params;
    const{group_name, currency} = req.body;
    try{
        const result = await pool.query('Update groups set group_name = $1, currency = $2 where group_id = $3 returning group_id, group_name, currency, created_at, created_by',
            [group_name, currency, id]
        )
        if(result.rows.length === 0){
            return res.status(404).json({error: 'GROUP NOT FOUND'});
        }
        res.json(result.rows[0]);
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO UPDATE'});
    }
})
    
//delete group by id
app.delete('/groups/:id', async(req,res)=>{
    const {id} = req.params;
    try{
        const result = await pool.query('delete from groups where group_id = $1 returning *',[id]);
    if(result.rows.length === 0){
        return res.status(404).json({error: 'GROUP NOT FOUND'});
    }
    res.json(result.rows[0]);

    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO DELETE'});
       }
    
})

app.get('/groups/:id/members', async(req, res)=>{
    const{id}= req.params;
    try{
        const result = await pool.query('Select u.user_id, u.name, u.email, u.created_at from users u join group_member gm on u.user_id = gm.user_id where gm.group_id = $1', [id]);
        if(result.rows.length === 0){
            return res.status(404).json({error: 'No memvers found or group does not exist'});
        }
        res.json(result.rows);


    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO FETCH'})
    }
});
app.post('/groups/:id/members', async (req, res) => {
    const { id } = req.params;
    const { user_id } = req.body;

    try {
        if (!user_id) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const userResult = await pool.query(
            'select user_id, name, email from users where user_id = $1',
            [user_id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const groupResult = await pool.query(
            'select group_id, group_name from groups where group_id = $1',
            [id]
        );

        if (groupResult.rows.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const alreadyMember = await pool.query(
            'select * from group_member where group_id = $1 and user_id = $2',
            [id, user_id]
        );

        if (alreadyMember.rows.length > 0) {
            return res.status(409).json({
                error: 'This user is already in this group'
            });
        }

        const result = await pool.query(
            'insert into group_member (group_id, user_id) values ($1, $2) returning *',
            [id, user_id]
        );

        const newUser = userResult.rows[0];
        const groupName = groupResult.rows[0].group_name;


        res.status(201).json({
            message: 'Member added successfully',
            member: result.rows[0]
        });

    } catch (err) {
        console.error(err);

        if (err.code === '23505') {
            return res.status(409).json({
                error: 'This user is already in this group'
            });
        }

        res.status(500).json({
            error: 'Failed to add member'
        });
    }
});

app.delete('/groups/:id/members/:userId', async (req, res) => {
    const { id, userId } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM group_member WHERE group_id = $1 AND user_id = $2 RETURNING *`,
            [id, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Member not found in this group' });
        }
        res.json({ message: 'Member removed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});
app.post('/groups/:id/expenses', async (req, res) => {
    const { id } = req.params;

    const {
        user_id,
        category_id,
        description,
        total_amount,
        original_currency,
        exchange_rate,
        settle_by_deadline,
        is_recurring,
        recurring_period,

        split_method = 'equal',
        included_members,
        ac_users,
        ac_base_percent,
        custom_shares,
        items
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (!user_id || !description || !total_amount) {
            throw new Error('Paid by, description and total amount are required.');
        }

        let membersToSplit = included_members;

        // If frontend does not send included_members, split between all group members
        if (!membersToSplit || membersToSplit.length === 0) {
            const membersResult = await client.query(
                `select user_id from group_member where group_id = $1`,
                [id]
            );

            membersToSplit = membersResult.rows.map(row => row.user_id);
        }

        if (!membersToSplit || membersToSplit.length === 0) {
            throw new Error('This group has no members to split with.');
        }

        const splits = calculateExpenseSplits({
            totalAmount: total_amount,
            splitMethod: split_method,
            includedMembers: membersToSplit,
            acUsers: ac_users || [],
            acBasePercent: ac_base_percent || 60,
            customShares: custom_shares || [],
            items: items || []
        });

        const expenseResult = await client.query(
            `INSERT INTO expenses 
            (
                group_id,
                user_id,
                category_id,
                description,
                total_amount,
                original_currency,
                exchange_rate,
                settle_by_deadline,
                is_recurring,
                recurring_period
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *`,
            [
                id,
                user_id,
                category_id || null,
                description,
                total_amount,
                original_currency || 'AUD',
                exchange_rate || 1,
                settle_by_deadline || null,
                is_recurring || false,
                recurring_period || null
            ]
        );

        const expense = expenseResult.rows[0];

        // Save itemized bill data if split method is itemized
        if (split_method === 'itemized' && items && items.length > 0) {
            for (const item of items) {
                const itemResult = await client.query(
                    `INSERT INTO expense_item
                    (expense_id, item_name, price)
                    VALUES ($1, $2, $3)
                    RETURNING item_id`,
                    [
                        expense.expense_id,
                        item.item_name,
                        item.price
                    ]
                );

                const itemId = itemResult.rows[0].item_id;

                for (const claim of item.claims) {
                    await client.query(
                        `INSERT INTO item_claim
                        (item_id, user_id, share_amount)
                        VALUES ($1, $2, $3)`,
                        [
                            itemId,
                            claim.user_id,
                            claim.share_amount
                        ]
                    );
                }
            }
        }

        // Save calculated split shares
        for (const split of splits) {
            await client.query(
                `INSERT INTO expense_split
                (expense_id, user_id, amount_owed)
                VALUES ($1, $2, $3)`,
                [
                    expense.expense_id,
                    split.user_id,
                    split.amount_owed
                ]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            expense,
            split_method,
            splits,
            message: 'Expense added and split calculated successfully.'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);

        res.status(400).json({
            error: err.message || 'Failed to add expense.'
        });

    } finally {
        client.release();
    }
});

app.get('/groups/:id/expenses', async(req,res)=>{
    const{id} = req.params;
    try{
        const result = await pool.query('select * from expenses where group_id = $1', [id]);
       
        
        res.json(result.rows);
        

    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO FETCH'});
    }
})

// Get an expense by ID
app.get('/expenses/:id', async (req, res) => {
const { id } = req.params;
try {
    const result = await pool.query('SELECT * FROM expenses WHERE expense_id = $1',
            [id]
        );
    if (result.rows.length === 0) {
            return res.status(404).json({error: 'Expense not found'});
        }

        res.json(result.rows[0]);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'FAILED TO FETCH'
        });

    }

});

app.put('/expenses/:id', async (req, res) => {
    const { id } = req.params;
    const { description, total_amount, category_id } = req.body;
    try {
        const result = await pool.query(
            'update expenses set description = $1, total_amount = $2, category_id = $3 where expense_id = $4 returning *',
            [description, total_amount, category_id, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO UPDATE' });
    }
});

app.delete('/expenses/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('delete from expenses where expense_id = $1 returning *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense deleted', deleted: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO DELETE' });
    }
});

app.get('/expenses/:id/splits', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `select 
                es.split_id,
                es.expense_id,
                es.user_id,
                u.name,
                u.email,
                es.amount_owed
             from expense_split es
             join users u on u.user_id = es.user_id
             where es.expense_id = $1
             order by u.name`,
            [id]
        );

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Failed to fetch expense splits.'
        });
    }
});
//settlements
app.post('/groups/:id/settlements', async (req, res) => {
    const { id } = req.params;
    const { payer_id, receiver_id, amount } = req.body;
    try {
        const result = await pool.query(
            'insert into settlement (group_id, payer_id, receiver_id, amount) values ($1, $2, $3, $4) returning *',
            [id, payer_id, receiver_id, amount]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO CREATE SETTLEMENT' });
    }
});

app.get('/groups/:id/settlements', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('select * from settlement where group_id = $1 order by settled_at desc', [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.get('/groups/:id/debts/simplified', async (req, res) => {
    const { id } = req.params;

    try {
        const membersResult = await pool.query(
            `select u.user_id, u.name, u.email
             from users u
             join group_member gm on gm.user_id = u.user_id
             where gm.group_id = $1`,
            [id]
        );

        const balances = {};

        membersResult.rows.forEach(member => {
            balances[member.user_id] = {
                user_id: member.user_id,
                name: member.name,
                email: member.email,
                balance: 0
            };
        });

        // Add money paid by each person
        const paidResult = await pool.query(
            `select user_id, coalesce(sum(total_amount), 0) as total_paid
             from expenses
             where group_id = $1
             group by user_id`,
            [id]
        );

        paidResult.rows.forEach(row => {
            if (balances[row.user_id]) {
                balances[row.user_id].balance += Number(row.total_paid);
            }
        });

        // Subtract each person's owed share
        const owedResult = await pool.query(
            `select es.user_id, coalesce(sum(es.amount_owed), 0) as total_owed
             from expense_split es
             join expenses e on e.expense_id = es.expense_id
             where e.group_id = $1
             group by es.user_id`,
            [id]
        );

        owedResult.rows.forEach(row => {
            if (balances[row.user_id]) {
                balances[row.user_id].balance -= Number(row.total_owed);
            }
        });

        // Apply settlements already made
        const settlementsResult = await pool.query(
            `select payer_id, receiver_id, coalesce(sum(amount), 0) as total
             from settlement
             where group_id = $1
             group by payer_id, receiver_id`,
            [id]
        );

        settlementsResult.rows.forEach(row => {
            // payer has reduced their debt
            if (balances[row.payer_id]) {
                balances[row.payer_id].balance += Number(row.total);
            }

            // receiver has received money, so their receivable reduces
            if (balances[row.receiver_id]) {
                balances[row.receiver_id].balance -= Number(row.total);
            }
        });

        const creditors = [];
        const debtors = [];

        Object.values(balances).forEach(person => {
            const balance = roundMoney(person.balance);

            if (balance > 0.01) {
                creditors.push({
                    user_id: person.user_id,
                    name: person.name,
                    email: person.email,
                    balance
                });
            }

            if (balance < -0.01) {
                debtors.push({
                    user_id: person.user_id,
                    name: person.name,
                    email: person.email,
                    balance: Math.abs(balance)
                });
            }
        });

        creditors.sort((a, b) => b.balance - a.balance);
        debtors.sort((a, b) => b.balance - a.balance);

        const simplifiedDebts = [];

        let i = 0;
        let j = 0;

        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const amount = roundMoney(Math.min(debtor.balance, creditor.balance));

            simplifiedDebts.push({
                payer_id: debtor.user_id,
                payer_name: debtor.name,
                receiver_id: creditor.user_id,
                receiver_name: creditor.name,
                amount
            });

            debtor.balance = roundMoney(debtor.balance - amount);
            creditor.balance = roundMoney(creditor.balance - amount);

            if (debtor.balance <= 0.01) i++;
            if (creditor.balance <= 0.01) j++;
        }

        res.json(simplifiedDebts);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: 'Failed to calculate simplified debts.'
        });
    }
});
//budgets
app.post('/groups/:id/budgets', async (req, res) => {
    const { id } = req.params;
    const { category_id, month, year, monthly_limit } = req.body;
    try {
        const result = await pool.query(
            'insert into budget (group_id, category_id, month, year, monthly_limit) values ($1,$2,$3,$4,$5) returning *',
            [id, category_id, month, year, monthly_limit]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO CREATE BUDGET' });
    }
});
app.get('/groups/:id/budgets', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `select b.*, c.category_name
             from budget b
             join category c on c.category_id = b.category_id
             where b.group_id = $1`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});
app.put('/budgets/:id', async (req, res) => {
    const { id } = req.params;
    const { monthly_limit } = req.body;
    try {
        const result = await pool.query(
            'update budget set monthly_limit = $1 where budget_id = $2 returning *',
            [monthly_limit, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Budget not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO UPDATE' });
    }
});

app.delete('/budgets/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('delete from budget where budget_id = $1 returning *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Budget not found' });
        }
        res.json({ message: 'Budget deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO DELETE' });
    }
});
//notifications
app.get('/notifications', async (req, res) => {
    const { user_id } = req.query;
    try {
        const result = await pool.query('select * from notification where user_id = $1 order by created_at desc', [user_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.put('/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'update notification set is_read = true where notification_id = $1 returning *',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO UPDATE' });
    }
});

//analytics
app.get('/api/v1/analytics/group-summary', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select 
                coalesce(sum(e.total_amount), 0)+=10 as total_spent,
                coalesce((select sum(amount) from settlement where group_id = $1), 0) as total_settled
            from expenses e where e.group_id = $1
        `, [group_id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.get('/api/v1/analytics/member-contributions', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select u.user_id, u.name,
                coalesce(sum(e.total_amount), 0) as total_paid
            from users u
            join group_member gm on gm.user_id = u.user_id
            left join expenses e on e.user_id = u.user_id and e.group_id = $1
            where gm.group_id = $1
            group by u.user_id, u.name
            order by total_paid desc
        `, [group_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

// 5) REPLACE: budget-alerts analytics — now includes category_name + budget_id for matching
app.get('/api/v1/analytics/budget-alerts', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select b.budget_id, b.category_id, b.monthly_limit, c.category_name,
                   coalesce(sum(e.total_amount), 0) as spent
            from budget b
            join category c on c.category_id = b.category_id
            left join expenses e on e.category_id = b.category_id and e.group_id = b.group_id
            where b.group_id = $1
            group by b.budget_id, b.category_id, b.monthly_limit, c.category_name
            having coalesce(sum(e.total_amount), 0) >= b.monthly_limit * 0.8
        `, [group_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.get('/api/v1/analytics/monthly-spending', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select date_trunc('month', created_at) as month, sum(total_amount) as total
            from expenses
            where group_id = $1
            group by month
            order by month
        `, [group_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.get('/api/v1/analytics/category-breakdown', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select c.category_name, sum(e.total_amount) as total
            from expenses e
            join category c on c.category_id = e.category_id
            where e.group_id = $1
            group by c.category_name
        `, [group_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});

app.get('/api/v1/analytics/top-expenses', async (req, res) => {
    const { group_id } = req.query;
    try {
        const result = await pool.query(`
            select * from expenses where group_id = $1
            order by total_amount desc limit 10
        `, [group_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH' });
    }
});




app.get('/categories', async (req, res) => {
    try {
        const result = await pool.query('select * from category order by category_name');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO FETCH CATEGORIES' });
    }
});




const pool = new Pool({
    connectionString : process.env.DATABASE_URL,

    ssl : {
        rejectUnauthorized : false
    }
});

app.listen(3000, ()=>{
    console.log(` SERVER IS RUNNING ON PORT 3000 `);
})