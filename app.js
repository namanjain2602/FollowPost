const express=require('express')
const path=require('path')
const app=express()
const fs = require('fs');
const userModel=require('./models/user')
const postModel=require('./models/post')
const cookieParser = require('cookie-parser')
const bcrypt=require('bcrypt')
const jwt=require('jsonwebtoken')
const crypto=require('crypto')
const upload = require('./config/multerconfig')
const defaultProfilePic = 'default.jpg';

app.set('view engine','ejs');
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public")));



app.get('/',(req,res)=>{
   res.render("index")
})

app.get('/users', isLoggedIn, async (req, res) => {
    let loggedInUser = await userModel.findOne({ email: req.user.email }).populate('following');
    let allUsers = await userModel.find({ _id: { $ne: loggedInUser._id } });

    res.render('users', { allUsers, loggedInUser });
});

app.post('/follow/:id', isLoggedIn, async (req, res) => {
    let loggedInUser = await userModel.findOne({ email: req.user.email });
    let userToFollow = await userModel.findOne({ _id: req.params.id });

    if (!loggedInUser.following.includes(userToFollow._id)) {
        loggedInUser.following.push(userToFollow._id);
        userToFollow.followers.push(loggedInUser._id);
    } else {
        loggedInUser.following.pull(userToFollow._id);
        userToFollow.followers.pull(loggedInUser._id);
    }

    await loggedInUser.save();
    await userToFollow.save();

    res.redirect('/users');
});


app.get('/profile/upload',isLoggedIn,(req,res)=>{
    res.render("profileupload")
})

app.post('/upload',isLoggedIn,upload.single("image"),async (req,res)=>{
    let user=await userModel.findOne({email:req.user.email})
    user.profilepic=req.file.filename
    await user.save()
    res.redirect('/profile')
})

app.get('/profile/delete',isLoggedIn,async (req,res)=>{
  let user=await userModel.findOne({email:req.user.email});
  if (user.profilepic !== defaultProfilePic) {
    const currentPicPath = path.join(__dirname, './public/images/uploads', user.profilepic);

    // Delete the current profile picture file
    fs.unlink(currentPicPath, (err) => {
        if (err) {
            console.error('Failed to delete profile picture:', err);
        }
    });

    // Update user's profile picture to the default one
    user.profilepic = defaultProfilePic;
    await user.save();
}
res.redirect('/profile');
})

app.get('/login',(req,res)=>{
    res.render("login")
 })

 app.get('/profile',isLoggedIn,async (req,res)=>{
    let user = await userModel.findOne({ email: req.user.email }).populate('following');
    if (!user) return res.redirect("/login");

    // Fetch posts from the user and the users they follow
    let posts = await postModel.find({ user: { $in: [...user.following, user._id] } }).populate('user');

    res.render('profile', { user, posts });
})

app.get('/like/:id',isLoggedIn,async (req,res)=>{
    let post=await postModel.findOne({_id:req.params.id}).populate("user")
    if(post.likes.indexOf(req.user.userid)===-1){
        post.likes.push(req.user.userid)
    }
    else{
        post.likes.splice(post.likes.indexOf(req.user.userid),1)
    }
    await post.save()
    res.redirect("/profile")
})

app.get('/edit/:id',isLoggedIn,async (req,res)=>{
    let post=await postModel.findOne({_id:req.params.id}).populate("user");

    res.render("edit",{post})
    
})

app.get('/delete/:id',isLoggedIn,async (req,res)=>{
    await postModel.findOneAndDelete({_id:req.params.id})
    res.redirect('/profile')
    
})

app.post('/update/:id',isLoggedIn,async (req,res)=>{
    let post=await postModel.findOneAndUpdate({_id:req.params.id},{content:req.body.content})

    res.redirect('/profile')
    
})

app.post('/post',isLoggedIn,async (req,res)=>{
    let user=await userModel.findOne({email:req.user.email})
    let {content}=req.body;
    let post=await postModel.create({
        user:user._id,
        content
    })
    user.posts.push(post._id)
    await user.save()
    res.redirect('/profile')
})

app.post('/register',async (req,res)=>{
   let {username,name,email,age,password}=req.body;
   if(!username||!name||!email||!age||!password)return res.send("Fill all fields")
   
   let user=await userModel.findOne({email})
   if(user)return res.status(500).send("User already registered!!")

    bcrypt.genSalt(10,(err,salt)=>{
      bcrypt.hash(password,salt,async (err,hash)=>{
          let user=await userModel.create({
           username,
           name,
           email,
           age,
           password:hash
          })
          let token=jwt.sign({email:email,userid:user._id},"shhhh")
          res.cookie("token",token)
          res.redirect('/login')
      })
    })

})

app.post('/login',async (req,res)=>{
    let {email,password}=req.body;
    
    let user=await userModel.findOne({email})
    if(!user)return res.status(500).send("Something Went Wrong!!")
 
    bcrypt.compare(password,user.password,(err,result)=>{
        if(result){
            let token=jwt.sign({email:email,userid:user._id},"shhhh")
            res.cookie("token",token)
            res.status(200).redirect('/profile')
        }
        else return res.redirect('/login')
    })
 
 })

app.get('/logout',(req,res)=>{
   res.cookie("token","")
   res.redirect('/login')
})

function isLoggedIn(req,res,next){
    if(req.cookies.token==="")return res.redirect('/login')
    else{
       let data=jwt.verify(req.cookies.token,"shhhh")
       req.user=data;
       next();
    }
}


app.listen(3000)