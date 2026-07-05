const express = require('express');
const { Pool, Result } = require('pg');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors());
//sign ip
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
            return res.status(401).json({error: 'InVALID email or password '});
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
        // 1. create the group
        const groupResult = await pool.query(
            'insert into groups(group_name, currency, created_by) values ($1, $2, $3) returning group_id, group_name, currency, created_by',
            [group_name, currency, created_by]
        );
        const newGroup = groupResult.rows[0];

        // 2. add the creator as a member of their own group
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
})

app.post('/groups/:id/members', async(req,res)=>{
    const {id} = req.params;
    const{user_id}= req.body;
    try{
        const result = await pool.query('INSERT into group_member (group_id, user_id) values ($1, $2) returning *',
            [id, user_id]
        );
        res.status(201).json(result.rows[0]);

    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO ADD'});
    }
});
app.post('/groups/:id/members', async(req,res)=>{
    const {id} = req.params;
    const{user_id}= req.body;
    try{
        const result = await pool.query('INSERT into group_member (group_id, user_id) values ($1, $2) returning *',
            [id, user_id]
        );

        const groupResult = await pool.query('select group_name from groups where group_id = $1', [id]);
        const groupName = groupResult.rows[0] ? groupResult.rows[0].group_name : 'a group';

        const newUserResult = await pool.query('select name from users where user_id = $1', [user_id]);
        const newUserName = newUserResult.rows[0] ? newUserResult.rows[0].name : 'Someone';

        // notify the new member
        await pool.query(
            `insert into notification (user_id, message, is_read, created_at) values ($1, $2, false, current_timestamp)`,
            [user_id, `You were added to "${groupName}"`]
        );

        // notify existing members that someone joined
        const membersResult = await pool.query(
            'select user_id from group_member where group_id = $1 and user_id != $2',
            [id, user_id]
        );
        for (const m of membersResult.rows) {
            await pool.query(
                `insert into notification (user_id, message, is_read, created_at) values ($1, $2, false, current_timestamp)`,
                [m.user_id, `${newUserName} joined "${groupName}"`]
            );
        }

        res.status(201).json(result.rows[0]);
    }catch(err){
        console.error(err);
        res.status(500).json({error: 'FAILED TO ADD'});
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
app.post('/groups/:id/expenses', async(req, res)=>{
    const {id} = req.params;
    const {user_id, category_id, group_id, description, total_amount, original_currency, exchange_rate, settle_by_deadline,
        interest_rate, is_recurring, recurring_period, created_at
    } = req.body;
    try{
        const result = await pool.query( `INSERT INTO expenses
            (
                group_id,
                user_id,
                category_id,
                description,
                total_amount,
                original_currency,
                exchange_rate,
                settle_by_deadline,
                interest_rate,
                is_recurring,
                recurring_period
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
            [
                id,
                user_id,
                category_id,
                description,
                total_amount,
                original_currency,
                exchange_rate,
                settle_by_deadline,
                interest_rate,
                is_recurring,
                recurring_period
            ]);
            res.status(201).json(result.rows[0]);

    }catch(err){
         console.error(err);
        res.status(500).json({error: 'FAILED TO ADD EXPENSE'});
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
        const result = await pool.query('SELECT * FROM debts_simplified WHERE group_id = $1', [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'FAILED TO CALCULATE' });
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
                coalesce(sum(e.total_amount), 0) as total_spent,
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



// 2) NEW: list categories (used by expense/budget dropdowns)
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